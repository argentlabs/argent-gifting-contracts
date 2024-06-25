use starknet::ClassHash;

#[starknet::interface]
pub trait ITimelockUpgrade<TContractState> {
    /// @notice Propose a new implementation for the contract to upgrade to
    /// @dev There is a 7-day window before it is possible to do the upgrade.
    /// @dev After the 7-day waiting period, the upgrade can be performed within a 7-day window
    /// @dev If there is an ongoing upgrade, the previous proposition will be overwritten
    /// @param new_implementation The class hash of the new implementation
    /// @param calldata The calldata to be used for the upgrade
    fn propose_upgrade(ref self: TContractState, new_implementation: ClassHash, calldata: Array<felt252>);

    /// @notice Cancel the upgrade proposition
    /// @dev Will fail if there is no ongoing upgrade
    fn cancel_upgrade(ref self: TContractState);

    /// @notice Perform the upgrade to the proposed implementation
    /// @dev Can only be called after a 7 day waiting period and is valid only for a 7 day window
    /// @param calldata The calldata to be used for the upgrade
    fn upgrade(ref self: TContractState, calldata: Array<felt252>);

    /// @notice Gets the proposed implementation
    fn get_proposed_implementation(self: @TContractState) -> ClassHash;

    /// @notice Gets the timestamp when the upgrade is ready to be performed, 0 if no upgrade ongoing
    fn get_upgrade_ready_at(self: @TContractState) -> u64;

    /// @notice Gets the hash of the calldata used for the upgrade, 0 if no upgrade ongoing
    fn get_calldata_hash(self: @TContractState) -> felt252;
}

#[starknet::interface]
pub trait ITimelockUpgradeCallback<TContractState> {
    /// @notice Perform the upgrade to the proposed implementation
    /// @dev Currently empty as the upgrade logic will be handled in the contract we upgrade to
    /// @param new_implementation The class hash of the new implementation
    /// @param data The data to be used for the upgrade
    fn perform_upgrade(ref self: TContractState, new_implementation: ClassHash, data: Span<felt252>);
}

#[starknet::component]
pub mod TimelockUpgradeComponent {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use openzeppelin::access::ownable::{OwnableComponent, OwnableComponent::InternalTrait};
    use starknet::{get_block_timestamp, ClassHash};
    use super::{
        ITimelockUpgrade, ITimelockUpgradeCallback, ITimelockUpgradeCallbackLibraryDispatcher,
        ITimelockUpgradeCallbackDispatcherTrait
    };

    /// Time before the upgrade can be performed
    const MIN_SECURITY_PERIOD: u64 = consteval_int!(7 * 24 * 60 * 60); // 7 days
    ///  Time window during which the upgrade can be performed
    const VALID_WINDOW_PERIOD: u64 = consteval_int!(7 * 24 * 60 * 60); // 7 days

    #[storage]
    pub struct Storage {
        pending_implementation: ClassHash,
        ready_at: u64,
        calldata_hash: felt252,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        UpgradeProposed: UpgradeProposed,
        UpgradeCancelled: UpgradeCancelled,
        Upgraded: Upgraded,
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeProposed {
        new_implementation: ClassHash,
        ready_at: u64,
        calldata: Array<felt252>
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeCancelled {
        cancelled_implementation: ClassHash
    }

    #[derive(Drop, starknet::Event)]
    struct Upgraded {
        new_implementation: ClassHash
    }

    #[embeddable_as(TimelockUpgradeImpl)]
    impl TimelockUpgrade<
        TContractState,
        +HasComponent<TContractState>,
        +OwnableComponent::HasComponent<TContractState>,
        +ITimelockUpgradeCallback<TContractState>,
    > of ITimelockUpgrade<ComponentState<TContractState>> {
        fn propose_upgrade(
            ref self: ComponentState<TContractState>, new_implementation: ClassHash, calldata: Array<felt252>
        ) {
            self.assert_only_owner();
            assert(new_implementation.is_non_zero(), 'upgrade/new-implementation-null');

            let pending_implementation = self.pending_implementation.read();
            if pending_implementation.is_non_zero() {
                self.emit(UpgradeCancelled { cancelled_implementation: pending_implementation })
            }

            self.pending_implementation.write(new_implementation);
            let ready_at = get_block_timestamp() + MIN_SECURITY_PERIOD;
            self.ready_at.write(ready_at);
            let calldata_hash = poseidon_hash_span(calldata.span());
            self.calldata_hash.write(calldata_hash);
            self.emit(UpgradeProposed { new_implementation, ready_at, calldata });
        }

        fn cancel_upgrade(ref self: ComponentState<TContractState>) {
            self.assert_only_owner();
            let proposed_implementation = self.pending_implementation.read();
            assert(proposed_implementation.is_non_zero(), 'upgrade/no-new-implementation');
            assert(self.ready_at.read() != 0, 'upgrade/not-ready');
            self.emit(UpgradeCancelled { cancelled_implementation: proposed_implementation });
            self.reset_storage();
        }

        fn upgrade(ref self: ComponentState<TContractState>, calldata: Array<felt252>) {
            self.assert_only_owner();
            let new_implementation = self.pending_implementation.read();
            let ready_at = self.ready_at.read();
            let block_timestamp = get_block_timestamp();
            let calldata_hash = poseidon_hash_span(calldata.span());
            assert(calldata_hash == self.calldata_hash.read(), 'upgrade/invalid-calldata');
            assert(new_implementation.is_non_zero(), 'upgrade/no-pending-upgrade');
            assert(block_timestamp >= ready_at, 'upgrade/too-early');
            assert(block_timestamp < ready_at + VALID_WINDOW_PERIOD, 'upgrade/upgrade-too-late');
            self.reset_storage();
            ITimelockUpgradeCallbackLibraryDispatcher { class_hash: new_implementation }
                .perform_upgrade(new_implementation, calldata.span());
        }

        fn get_proposed_implementation(self: @ComponentState<TContractState>) -> ClassHash {
            self.pending_implementation.read()
        }

        fn get_upgrade_ready_at(self: @ComponentState<TContractState>) -> u64 {
            self.ready_at.read()
        }

        fn get_calldata_hash(self: @ComponentState<TContractState>) -> felt252 {
            self.calldata_hash.read()
        }
    }
    #[generate_trait]
    impl PrivateImpl<
        TContractState, impl Ownable: OwnableComponent::HasComponent<TContractState>, +HasComponent<TContractState>
    > of PrivateTrait<TContractState> {
        fn assert_only_owner(self: @ComponentState<TContractState>) {
            get_dep_component!(self, Ownable).assert_only_owner();
        }

        fn reset_storage(ref self: ComponentState<TContractState>) {
            self.pending_implementation.write(Zero::zero());
            self.ready_at.write(0);
            self.calldata_hash.write(0);
        }
    }
}
