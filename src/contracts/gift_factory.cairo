use starknet::{ContractAddress, account::Call};
use starknet_gifting::contracts::utils::{serialize};

#[starknet::contract]
mod GiftFactory {
    use core::array::ArrayTrait;
    use core::ecdsa::check_ecdsa_signature;
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::security::PausableComponent;
    use openzeppelin::token::erc20::interface::{IERC20, IERC20DispatcherTrait, IERC20Dispatcher};
    use starknet::{ClassHash, ContractAddress, deploy_syscall, get_caller_address, get_contract_address, account::Call};
    use starknet_gifting::contracts::claim_hash::{ClaimExternal, IOffChainMessageHashRev1};
    use starknet_gifting::contracts::claim_utils::{calculate_claim_account_address};

    use starknet_gifting::contracts::interface::{
        IGiftAccountDispatcherTrait, IGiftFactory, ClaimData, AccountConstructorArguments, IGiftAccountDispatcher,
        ITimelockUpgradeCallback
    };
    use starknet_gifting::contracts::timelock_upgrade::TimelockUpgradeComponent;
    use starknet_gifting::contracts::utils::{STRK_ADDRESS, ETH_ADDRESS, serialize, full_deserialize};
    use super::build_transfer_call;

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
        GiftCanceled: GiftCanceled,
    }

    #[derive(Drop, starknet::Event)]
    struct GiftCreated {
        #[key]
        claim_pubkey: felt252,
        #[key] // Find back all gifts from a specific sender
        sender: ContractAddress,
        #[key] // If you have the ContractAddress you can find back the claim 
        gift_address: ContractAddress,
        class_hash: ClassHash,
        factory: ContractAddress,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
    }

    // TODO Do we need a different event for external claims?
    #[derive(Drop, starknet::Event)]
    struct GiftClaimed {
        #[key]
        receiver: ContractAddress
    }

    #[derive(Drop, starknet::Event)]
    struct GiftCanceled {}

    // TODO replace all fields with NonZero<T>

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
                assert(fee_amount.into() < gift_amount, 'gift-fac/fee-too-high');
            }

            let sender = get_caller_address();
            let factory = get_contract_address();
            // TODO We could manually serialize for better performance
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
                        claim_pubkey,
                        factory,
                        gift_address: claim_contract,
                        class_hash,
                        sender,
                        gift_token,
                        gift_amount,
                        fee_token,
                        fee_amount
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
            let balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(claim_address);
            assert(balance >= claim.gift_amount, 'gift/already-claimed-or-cancel');
            self.transfer_from_account(claim, claim_address, claim.gift_token, claim.gift_amount, receiver);
            self.emit(GiftClaimed { receiver });
        }

        fn claim_external(
            ref self: ContractState, claim: ClaimData, receiver: ContractAddress, signature: Array<felt252>
        ) {
            let claim_address = self.check_claim_and_get_account_address(claim);
            let claim_external_hash = ClaimExternal { receiver }.get_message_hash_rev_1(claim_address);
            assert(
                check_ecdsa_signature(claim_external_hash, claim.claim_pubkey, *signature[0], *signature[1]),
                'gift/invalid-ext-signature'
            );
            let balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(claim_address);
            assert(balance >= claim.gift_amount, 'gift/already-claimed-or-cancel');
            self.transfer_from_account(claim, claim_address, claim.gift_token, balance, receiver);
            self.emit(GiftClaimed { receiver });
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
            self.emit(GiftCanceled {});
        }

        fn get_dust(ref self: ContractState, claim: ClaimData, receiver: ContractAddress) {
            self.ownable.assert_only_owner();
            let claim_address = self.check_claim_and_get_account_address(claim);
            let gift_balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(claim_address);
            if claim.gift_token == claim.fee_token {
                assert(gift_balance < claim.fee_amount.into(), 'gift/not-yet-claimed');
                self.transfer_from_account(claim, claim_address, claim.gift_token, gift_balance, receiver);
            } else {
                assert(gift_balance < claim.gift_amount, 'gift/not-yet-claimed');
                let fee_balance = IERC20Dispatcher { contract_address: claim.fee_token }.balance_of(claim_address);
                self.transfer_from_account(claim, claim_address, claim.fee_token, fee_balance, claim.sender);
            }
        }

        fn get_latest_claim_class_hash(self: @ContractState) -> ClassHash {
            self.claim_class_hash.read()
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
            core::panic_with_felt252('downgrade-not-allowed');
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
}

fn build_transfer_call(token: ContractAddress, amount: u256, receiver: ContractAddress,) -> Call {
    Call { to: token, selector: selector!("transfer"), calldata: serialize(@(receiver, amount)).span() }
}
