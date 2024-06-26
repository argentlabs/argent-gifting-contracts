use starknet::{ContractAddress, ClassHash};

#[starknet::interface]
pub trait IGiftFactory<TContractState> {
    /// @notice Creates a new claim
    /// @dev This function can be paused by the owner of the factory and prevent any further deposits
    /// @param claim_class_hash The class hash of the claim account (needed in FE to have an optimistic UI)
    /// @param gift_token The ERC-20 token address of the gift
    /// @param gift_amount The amount of the gift
    /// @param fee_token The ERC-20 token address of the fee (can ONLY be ETH or STARK address) used to claim the gift through claim_internal
    /// @param fee_amount The amount of the fee
    /// @param claim_pubkey The public key associated with the gift
    fn deposit(
        ref self: TContractState,
        claim_class_hash: ClassHash,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    );

    /// @notice Retrieve the current class_hash used for creating a gift account
    fn get_latest_claim_class_hash(self: @TContractState) -> ClassHash;

    fn get_account_impl_class_hash(self: @TContractState, account_class_hash: ClassHash) -> ClassHash;

    /// @notice Get the address of the claim account contract given all parameters
    /// @param class_hash The class hash
    /// @param sender The address of the sender
    /// @param gift_token The ERC-20 token address of the gift
    /// @param gift_amount The amount of the gift
    /// @param fee_token The ERC-20 token address of the fee
    /// @param fee_amount The amount of the fee
    /// @param claim_pubkey The public key associated with the gift
    fn get_claim_address(
        self: @TContractState,
        class_hash: ClassHash,
        sender: ContractAddress,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    ) -> ContractAddress;
}


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
    use argent_gifting::contracts::escrow_account::{IEscrowAccount, IEscrowAccountDispatcher, AccountConstructorArguments};
    use argent_gifting::contracts::claim_data::{GiftData};
    use argent_gifting::contracts::claim_hash::{ClaimExternal, IOffChainMessageHashRev1};
    use argent_gifting::contracts::gift_factory::IGiftFactory;
    use argent_gifting::contracts::timelock_upgrade::{ITimelockUpgradeCallback, TimelockUpgradeComponent};
    use argent_gifting::contracts::utils::{
        calculate_escrow_account_address, STRK_ADDRESS, ETH_ADDRESS, serialize, full_deserialize
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
        account_impl_class_hash: ClassHash,
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

    #[constructor]
    fn constructor(
        ref self: ContractState, claim_class_hash: ClassHash, account_impl_class_hash: ClassHash, owner: ContractAddress
    ) {
        self.claim_class_hash.write(claim_class_hash);
        self.account_impl_class_hash.write(account_impl_class_hash);
        self.ownable.initializer(owner);
    }

    #[abi(embed_v0)]
    impl GiftFactoryImpl of IGiftFactory<ContractState> {
        fn deposit(
            ref self: ContractState,
            claim_class_hash: ClassHash,
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
            assert(class_hash == claim_class_hash, 'gift-fac/invalid-class-hash');
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

        fn get_account_impl_class_hash(self: @ContractState, account_class_hash: ClassHash) -> ClassHash {
            self.account_impl_class_hash.read()
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
            calculate_escrow_account_address(
                GiftData {
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

    #[abi(embed_v0)]
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
}
