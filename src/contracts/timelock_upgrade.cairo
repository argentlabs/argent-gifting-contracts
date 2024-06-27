use core::num::traits::Zero;
use starknet::{ClassHash};

#[derive(Serde, Drop, Copy, PartialEq, starknet::Store)]
struct PendingUpgrade {
    // Gets the classhash after
    implementation: ClassHash,
    // Gets the timestamp when the upgrade is ready to be performed, 0 if no upgrade ongoing
    ready_at: u64,
    // Gets the hash of the calldata used for the upgrade, 0 if no upgrade ongoing
    calldata_hash: felt252,
}

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

    /// @notice Gets the proposed upgrade
    fn get_pending_upgrade(self: @TContractState) -> PendingUpgrade;
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
        ITimelockUpgradeCallbackDispatcherTrait, PendingUpgrade, PendingUpgradeZero
    };

    /// Time before the upgrade can be performed
    const MIN_SECURITY_PERIOD: u64 = consteval_int!(7 * 24 * 60 * 60); // 7 days
    ///  Time window during which the upgrade can be performed
    const VALID_WINDOW_PERIOD: u64 = consteval_int!(7 * 24 * 60 * 60); // 7 days


    #[storage]
    pub struct Storage {
        pending_upgrade: PendingUpgrade
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
        cancelled_upgrade: PendingUpgrade
    }

    #[derive(Drop, starknet::Event)]
    struct Upgraded {
        executed_upgrade: PendingUpgrade
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

            let pending_upgrade = self.pending_upgrade.read();
            if pending_upgrade.is_non_zero() {
                self.emit(UpgradeCancelled { cancelled_upgrade: pending_upgrade })
            }

            let ready_at = get_block_timestamp() + MIN_SECURITY_PERIOD;
            self
                .pending_upgrade
                .write(
                    PendingUpgrade {
                        implementation: new_implementation, ready_at, calldata_hash: poseidon_hash_span(calldata.span())
                    }
                );
            self.emit(UpgradeProposed { new_implementation, ready_at, calldata });
        }

        fn cancel_upgrade(ref self: ComponentState<TContractState>) {
            self.assert_only_owner();
            let proposed_implementation = self.pending_upgrade.read();
            assert(proposed_implementation.is_non_zero(), 'upgrade/no-pending-upgrade');
            self.pending_upgrade.write(Zero::zero());
            self.emit(UpgradeCancelled { cancelled_upgrade: proposed_implementation });
        }

        fn upgrade(ref self: ComponentState<TContractState>, calldata: Array<felt252>) {
            self.assert_only_owner();
            let proposed_implementation = self.pending_upgrade.read();
            assert(proposed_implementation.is_non_zero(), 'upgrade/no-pending-upgrade');

            let current_timestamp = get_block_timestamp();
            assert(
                proposed_implementation.calldata_hash == poseidon_hash_span(calldata.span()), 'upgrade/invalid-calldata'
            );

            assert(current_timestamp >= proposed_implementation.ready_at, 'upgrade/too-early');
            assert(
                current_timestamp < proposed_implementation.ready_at + VALID_WINDOW_PERIOD, 'upgrade/upgrade-too-late'
            );
            self.pending_upgrade.write(Zero::zero());
            ITimelockUpgradeCallbackLibraryDispatcher { class_hash: proposed_implementation.implementation }
                .perform_upgrade(proposed_implementation.implementation, calldata.span());
        }

        fn get_pending_upgrade(self: @ComponentState<TContractState>) -> PendingUpgrade {
            self.pending_upgrade.read()
        }
    }
    #[generate_trait]
    impl PrivateImpl<
        TContractState, impl Ownable: OwnableComponent::HasComponent<TContractState>, +HasComponent<TContractState>
    > of PrivateTrait<TContractState> {
        fn assert_only_owner(self: @ComponentState<TContractState>) {
            get_dep_component!(self, Ownable).assert_only_owner();
        }
    }
}


impl PendingUpgradeZero of core::num::traits::Zero<PendingUpgrade> {
    fn zero() -> PendingUpgrade {
        PendingUpgrade { implementation: Zero::zero(), ready_at: 0, calldata_hash: 0 }
    }
    fn is_zero(self: @PendingUpgrade) -> bool {
        *self == Zero::zero()
    }
    fn is_non_zero(self: @PendingUpgrade) -> bool {
        !self.is_zero()
    }
}
