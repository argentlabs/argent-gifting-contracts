#[starknet::contract]
mod GiftFactory {
    use core::ecdsa::check_ecdsa_signature;
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::security::PausableComponent;
    use openzeppelin::token::erc20::interface::{IERC20, IERC20DispatcherTrait, IERC20Dispatcher};
    use openzeppelin::utils::deployments::calculate_contract_address_from_deploy_syscall;
    use starknet::{
        ClassHash, ContractAddress, deploy_syscall, get_caller_address, get_contract_address,
        contract_address::contract_address_const, account::Call
    };
    use starknet_gifting::contracts::claim_hash::{ClaimExternal, IOffChainMessageHashRev1};
    use starknet_gifting::contracts::claim_utils::{calculate_claim_account_address};

    use starknet_gifting::contracts::interface::{
        IGiftAccount, IGiftAccountDispatcherTrait, IGiftFactory, ClaimData, AccountConstructorArguments,
        IGiftAccountDispatcher, ITimelockUpgradeCallback
    };
    use starknet_gifting::contracts::timelock_upgrade::{TimelockUpgradeComponent};
    use starknet_gifting::contracts::utils::{STRK_ADDRESS, ETH_ADDRESS, serialize, full_deserialize};

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
        amount: u256,
        max_fee: u128,
        token: ContractAddress,
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
            ref self: ContractState, amount: u256, max_fee: u128, token: ContractAddress, claim_pubkey: felt252
        ) {
            self.pausable.assert_not_paused();
            assert(token == STRK_ADDRESS() || token == ETH_ADDRESS(), 'gift-fac/invalid-token');
            assert(max_fee.into() < amount, 'gift-fac/fee-too-high');

            let sender = get_caller_address();
            let factory = get_contract_address();
            // TODO We could manually serialize for better performance
            let constructor_arguments = AccountConstructorArguments { sender, amount, max_fee, token, claim_pubkey };
            let (claim_contract, _) = deploy_syscall(
                self.claim_class_hash.read(), // class_hash
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
                        class_hash: self.claim_class_hash.read(),
                        sender,
                        amount,
                        max_fee,
                        token,
                    }
                );
            let transfer_status = IERC20Dispatcher { contract_address: token }
                .transfer_from(get_caller_address(), claim_contract, amount + max_fee.into());
            assert(transfer_status, 'gift-fac/transfer-failed');
        }

        fn claim_internal(ref self: ContractState, claim: ClaimData, receiver: ContractAddress) {
            let claim_address = self.check_factory_and_get_account_address(claim);
            assert(get_caller_address() == claim_address, 'gift/only-claim-account');
            let balance = IERC20Dispatcher { contract_address: claim.token }.balance_of(claim_address);
            assert(balance >= claim.amount, 'gift/already-claimed-or-cancel');
            self.transfer_from_account(claim, claim_address, claim.token, claim.amount, receiver);
            self.emit(GiftClaimed { receiver });
        }

        fn claim_external(
            ref self: ContractState, claim: ClaimData, receiver: ContractAddress, signature: Array<felt252>
        ) {
            let claim_address = self.check_factory_and_get_account_address(claim);
            let claim_external_hash = ClaimExternal { claim, receiver }.get_message_hash_rev_1(claim_address);
            assert(
                check_ecdsa_signature(claim_external_hash, claim.claim_pubkey, *signature[0], *signature[1]),
                'gift/invalid-ext-signature'
            );

            let balance = IERC20Dispatcher { contract_address: claim.token }.balance_of(claim_address);
            assert(balance >= claim.amount, 'gift/already-claimed-or-cancel');
            self.transfer_from_account(claim, claim_address, claim.token, balance, receiver);
            self.emit(GiftClaimed { receiver });
        }

        fn cancel(ref self: ContractState, claim: ClaimData) {
            let claim_address = self.check_factory_and_get_account_address(claim);
            assert(get_caller_address() == claim.sender, 'gift/wrong-sender');

            let balance = IERC20Dispatcher { contract_address: claim.token }.balance_of(claim_address);
            // Won't that lead to the sender also being able to get the extra dust?
            // assert(balance > claim.max_fee, 'already claimed');
            assert(balance > 0, 'gift/already-claimed');
            self.transfer_from_account(claim, claim_address, claim.token, balance, claim.sender);
            self.emit(GiftCanceled {});
        }


        fn get_dust(ref self: ContractState, claim: ClaimData, receiver: ContractAddress) {
            self.ownable.assert_only_owner();
            let claim_address = self.check_factory_and_get_account_address(claim);

            let balance = IERC20Dispatcher { contract_address: claim.token }.balance_of(claim_address);
            assert(balance < claim.max_fee.into(), 'gift/not-yet-claimed');
            self.transfer_from_account(claim, claim_address, claim.token, balance, receiver);
        }

        fn get_claim_class_hash(ref self: ContractState) -> ClassHash {
            self.claim_class_hash.read()
        }

        fn get_claim_address(
            self: @ContractState,
            sender: ContractAddress,
            amount: u256,
            max_fee: u128,
            token: ContractAddress,
            claim_pubkey: felt252
        ) -> ContractAddress {
            calculate_claim_account_address(
                ClaimData {
                    factory: get_contract_address(),
                    class_hash: self.claim_class_hash.read(),
                    sender,
                    amount,
                    max_fee,
                    token,
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
        fn check_factory_and_get_account_address(self: @ContractState, claim: ClaimData) -> ContractAddress {
            assert(claim.factory == get_contract_address(), 'gift/invalid-factory-address');
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
            let results = IGiftAccountDispatcher { contract_address: claim_address }
                .execute_factory_calls(
                    claim,
                    array![
                        Call {
                            to: token, selector: selector!("transfer"), calldata: serialize(@(receiver, amount)).span()
                        },
                    ]
                );
            let transfer_status = full_deserialize::<bool>(*results.at(0)).expect('gift/invalid-result-calldata');
            assert(transfer_status, 'gift/transfer-failed');
        }
    }
}
