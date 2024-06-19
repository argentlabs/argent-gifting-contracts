#[starknet::contract]
mod GiftFactory {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::zero::Zero;
    use core::panic_with_felt252;
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::security::PausableComponent;
    use openzeppelin::token::erc20::interface::{IERC20, IERC20DispatcherTrait, IERC20Dispatcher};
    use starknet::{
        ClassHash, ContractAddress, syscalls::deploy_syscall, get_caller_address, get_contract_address, account::Call,
        get_block_timestamp
    };
    use starknet_gifting::contracts::claim_hash::{ClaimExternal, IOffChainMessageHashRev1};
    use starknet_gifting::contracts::interface::{
        IGiftAccountDispatcherTrait, IGiftFactory, ClaimData, AccountConstructorArguments, IGiftAccountDispatcher,
        OutsideExecution, GiftStatus, StarknetSignature
    };
    use starknet_gifting::contracts::timelock_upgrade::{ITimelockUpgradeCallback, TimelockUpgradeComponent};
    use starknet_gifting::contracts::utils::{
        calculate_claim_account_address, STRK_ADDRESS, ETH_ADDRESS, serialize, full_deserialize
    };

    // Ownable 
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl InternalImpl = OwnableComponent::InternalImpl<ContractState>;

    // Pausable
    component!(path: PausableComponent, storage: pausable, event: PausableEvent);
    #[abi(embed_v0)]
    impl PausableImpl = PausableComponent::PausableImpl<ContractState>;
    impl PausableInternalImpl = PausableComponent::InternalImpl<ContractState>;


    // TimelockUpgradeable
    component!(path: TimelockUpgradeComponent, storage: timelock_upgrade, event: TimelockUpgradeEvent);
    #[abi(embed_v0)]
    impl TimelockUpgradeImpl = TimelockUpgradeComponent::TimelockUpgradeImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        pausable: PausableComponent::Storage,
        #[substorage(v0)]
        timelock_upgrade: TimelockUpgradeComponent::Storage,
        claim_class_hash: ClassHash,
    }

    #[derive(Drop, Copy)]
    struct TransferFromAccount {
        token: ContractAddress,
        amount: u256,
        receiver: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        PausableEvent: PausableComponent::Event,
        #[flat]
        TimelockUpgradeEvent: TimelockUpgradeComponent::Event,
        GiftCreated: GiftCreated,
        GiftClaimed: GiftClaimed,
        GiftCancelled: GiftCancelled,
    }

    #[derive(Drop, starknet::Event)]
    struct GiftCreated {
        #[key] // If you have the ContractAddress you can find back the claim 
        gift_address: ContractAddress,
        #[key] // Find all gifts from a specific sender
        sender: ContractAddress,
        class_hash: ClassHash,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    }

    #[derive(Drop, starknet::Event)]
    struct GiftClaimed {
        #[key]
        gift_address: ContractAddress,
        receiver: ContractAddress,
        dust_receiver: ContractAddress
    }

    #[derive(Drop, starknet::Event)]
    struct GiftCancelled {
        #[key]
        gift_address: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, claim_class_hash: ClassHash, owner: ContractAddress) {
        self.claim_class_hash.write(claim_class_hash);
        self.ownable.initializer(owner);
    }

    #[abi(embed_v0)]
    impl GiftFactoryImpl of IGiftFactory<ContractState> {
        fn deposit(
            ref self: ContractState,
            gift_token: ContractAddress,
            gift_amount: u256,
            fee_token: ContractAddress,
            fee_amount: u128,
            claim_pubkey: felt252
        ) {
            self.pausable.assert_not_paused();
            assert(fee_token == STRK_ADDRESS() || fee_token == ETH_ADDRESS(), 'gift-fac/invalid-fee-token');
            if gift_token == fee_token {
                // This is needed so we can tell if an gift has been claimed or not just by looking at the balances
                assert(fee_amount.into() < gift_amount, 'gift-fac/fee-too-high');
            }

            let sender = get_caller_address();
            // TODO We could manually serialize for better performance but then we loose the type safety
            let class_hash = self.claim_class_hash.read();
            let constructor_arguments = AccountConstructorArguments {
                sender, gift_token, gift_amount, fee_token, fee_amount, claim_pubkey
            };
            let (claim_contract, _) = deploy_syscall(
                class_hash, // class_hash
                0, // salt
                serialize(@constructor_arguments).span(), // constructor data
                false // deploy_from_zero
            )
                .expect('gift-fac/deploy-failed');
            self
                .emit(
                    GiftCreated {
                        gift_address: claim_contract,
                        sender,
                        class_hash,
                        gift_token,
                        gift_amount,
                        fee_token,
                        fee_amount,
                        claim_pubkey
                    }
                );

            if (gift_token == fee_token) {
                let transfer_status = IERC20Dispatcher { contract_address: gift_token }
                    .transfer_from(get_caller_address(), claim_contract, gift_amount + fee_amount.into());
                assert(transfer_status, 'gift-fac/transfer-failed');
            } else {
                let transfer_gift_status = IERC20Dispatcher { contract_address: gift_token }
                    .transfer_from(get_caller_address(), claim_contract, gift_amount);
                assert(transfer_gift_status, 'gift-fac/transfer-gift-failed');
                let transfer_fee_status = IERC20Dispatcher { contract_address: fee_token }
                    .transfer_from(get_caller_address(), claim_contract, fee_amount.into());
                assert(transfer_fee_status, 'gift-fac/transfer-fee-failed');
            }
        }

        fn claim_internal(ref self: ContractState, claim: ClaimData, receiver: ContractAddress) {
            let claim_address = self.check_claim_and_get_account_address(claim);
            assert(get_caller_address() == claim_address, 'gift/only-claim-account');
            self.proceed_with_claim(claim_address, claim, receiver, Zero::zero());
        }

        fn claim_external(
            ref self: ContractState,
            claim: ClaimData,
            receiver: ContractAddress,
            dust_receiver: ContractAddress,
            signature: StarknetSignature
        ) {
            let claim_address = self.check_claim_and_get_account_address(claim);
            let claim_external_hash = ClaimExternal { receiver, dust_receiver }.get_message_hash_rev_1(claim_address);
            assert(
                check_ecdsa_signature(claim_external_hash, claim.claim_pubkey, signature.r, signature.s),
                'gift/invalid-ext-signature'
            );
            self.proceed_with_claim(claim_address, claim, receiver, dust_receiver);
        }

        fn is_valid_account_signature(
            self: @ContractState, claim: ClaimData, hash: felt252, mut remaining_signature: Span<felt252>
        ) -> felt252 {
            0 // Accounts don't support offchain signatures now, but it could
        }

        fn perform_execute_from_outside(
            ref self: ContractState,
            claim: ClaimData,
            original_caller: ContractAddress,
            outside_execution: OutsideExecution,
            remaining_signature: Span<felt252>
        ) -> Array<Span<felt252>> {
            panic_with_felt252('outside-execution-not-allowed');
            array![]
        }

        fn cancel(ref self: ContractState, claim: ClaimData) {
            let claim_address = self.check_claim_and_get_account_address(claim);
            assert(get_caller_address() == claim.sender, 'gift/wrong-sender');

            let gift_balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(claim_address);
            assert(gift_balance > 0, 'gift/already-claimed');
            if claim.gift_token == claim.fee_token {
                // Sender also gets the dust
                self.transfer_from_account(claim, claim_address, claim.gift_token, gift_balance, claim.sender);
            } else {
                // Transfer both tokens in a multicall
                let fee_balance = IERC20Dispatcher { contract_address: claim.fee_token }.balance_of(claim_address);
                self
                    .transfers_from_account(
                        claim,
                        claim_address,
                        array![
                            TransferFromAccount {
                                token: claim.gift_token, amount: gift_balance, receiver: claim.sender
                            },
                            TransferFromAccount { token: claim.fee_token, amount: fee_balance, receiver: claim.sender }
                        ]
                            .span()
                    );
            }
            self.emit(GiftCancelled { gift_address: claim_address });
        }

        fn get_dust(ref self: ContractState, claim: ClaimData, receiver: ContractAddress) {
            self.ownable.assert_only_owner();
            let claim_address = self.check_claim_and_get_account_address(claim);
            let gift_balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(claim_address);
            assert(gift_balance < claim.gift_amount, 'gift/not-yet-claimed');
            if claim.gift_token == claim.fee_token {
                self.transfer_from_account(claim, claim_address, claim.gift_token, gift_balance, receiver);
            } else {
                let fee_balance = IERC20Dispatcher { contract_address: claim.fee_token }.balance_of(claim_address);
                self.transfer_from_account(claim, claim_address, claim.fee_token, fee_balance, claim.sender);
            }
        }

        fn get_latest_claim_class_hash(self: @ContractState) -> ClassHash {
            self.claim_class_hash.read()
        }

        fn get_gift_status(self: @ContractState, claim: ClaimData) -> GiftStatus {
            let claim_address = self.check_claim_and_get_account_address(claim);
            let gift_balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(claim_address);
            if gift_balance < claim.gift_amount {
                return GiftStatus::ClaimedOrCancelled;
            }
            if (claim.gift_token == claim.fee_token) {
                if gift_balance < claim.gift_amount + claim.fee_amount.into() {
                    return GiftStatus::ReadyExternalOnly;
                } else {
                    return GiftStatus::Ready;
                }
            } else {
                let fee_balance = IERC20Dispatcher { contract_address: claim.fee_token }.balance_of(claim_address);
                if fee_balance < claim.fee_amount.into() {
                    return GiftStatus::ReadyExternalOnly;
                } else {
                    return GiftStatus::Ready;
                }
            }
        }

        fn get_claim_address(
            self: @ContractState,
            class_hash: ClassHash,
            sender: ContractAddress,
            gift_token: ContractAddress,
            gift_amount: u256,
            fee_token: ContractAddress,
            fee_amount: u128,
            claim_pubkey: felt252
        ) -> ContractAddress {
            calculate_claim_account_address(
                ClaimData {
                    factory: get_contract_address(),
                    class_hash,
                    sender,
                    gift_amount,
                    gift_token,
                    fee_token,
                    fee_amount,
                    claim_pubkey,
                }
            )
        }
    }


    impl TimelockUpgradeCallbackImpl of ITimelockUpgradeCallback<ContractState> {
        fn perform_upgrade(ref self: ContractState, new_implementation: ClassHash, data: Span<felt252>) {
            // This should do some sanity checks 
            // We should check that the new implementation is a valid implementation
            // Execute the upgrade using replace_class_syscall(...)
            panic_with_felt252('downgrade-not-allowed');
        }
    }

    #[external(v0)]
    fn pause(ref self: ContractState) {
        self.ownable.assert_only_owner();
        self.pausable._pause();
    }

    #[external(v0)]
    fn unpause(ref self: ContractState) {
        self.ownable.assert_only_owner();
        self.pausable._unpause();
    }

    #[generate_trait]
    impl Private of PrivateTrait {
        fn proceed_with_claim(
            ref self: ContractState,
            gift_address: ContractAddress,
            claim: ClaimData,
            receiver: ContractAddress,
            dust_receiver: ContractAddress
        ) {
            assert(receiver.is_non_zero(), 'gift/zero-receiver');
            let gift_balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(gift_address);
            assert(gift_balance >= claim.gift_amount, 'gift/already-claimed-or-cancel');

            // could be optimized to 1 transfer only when the receiver is also the dust receiver, and the fee token is the same as the gift token
            // but will increase the complexity of the code for a small performance GiftCancelled

            // Transfer the gift
            let mut calls = array![
                TransferFromAccount { token: claim.gift_token, amount: claim.gift_amount, receiver: receiver }
            ];

            // Transfer the dust
            if dust_receiver.is_non_zero() {
                let dust = if claim.gift_token == claim.fee_token {
                    gift_balance - claim.gift_amount
                } else {
                    IERC20Dispatcher { contract_address: claim.fee_token }.balance_of(gift_address)
                };
                if dust > 0 {
                    calls
                        .append(
                            TransferFromAccount { token: claim.fee_token, amount: dust.into(), receiver: dust_receiver }
                        );
                }
            }
            self.transfers_from_account(claim, gift_address, calls.span());
            self.emit(GiftClaimed { gift_address, receiver, dust_receiver });
        }

        fn check_claim_and_get_account_address(self: @ContractState, claim: ClaimData) -> ContractAddress {
            assert(claim.factory == get_contract_address(), 'gift/invalid-factory-address');
            assert(claim.class_hash == self.claim_class_hash.read(), 'gift/invalid-class-hash');
            calculate_claim_account_address(claim)
        }

        fn transfer_from_account(
            self: @ContractState,
            claim: ClaimData,
            claim_address: ContractAddress,
            token: ContractAddress,
            amount: u256,
            receiver: ContractAddress,
        ) {
            self
                .transfers_from_account(
                    claim, claim_address, array![TransferFromAccount { token, amount, receiver }].span()
                );
        }

        fn transfers_from_account(
            self: @ContractState,
            claim: ClaimData,
            claim_address: ContractAddress,
            mut transfers: Span<TransferFromAccount>,
        ) {
            let mut calls: Array<Call> = array![];
            while let Option::Some(transfer) = transfers
                .pop_front() {
                    calls.append(build_transfer_call(*transfer.token, *transfer.amount, *transfer.receiver));
                };
            let calls_len = calls.len();

            let mut results = IGiftAccountDispatcher { contract_address: claim_address }
                .execute_factory_calls(claim, calls);
            assert(results.len() == calls_len, 'gift/invalid-result-length');
            while let Option::Some(result) = results
                .pop_front() {
                    let transfer_status = full_deserialize::<bool>(result).expect('gift/invalid-result-calldata');
                    assert(transfer_status, 'gift/transfer-failed');
                }
        }
    }


    fn build_transfer_call(token: ContractAddress, amount: u256, receiver: ContractAddress,) -> Call {
        Call { to: token, selector: selector!("transfer"), calldata: serialize(@(receiver, amount)).span() }
    }
}
