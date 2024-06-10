#[starknet::component]
pub mod TimelockUpgradeComponent {
    use core::num::traits::Zero;
    use openzeppelin::access::ownable::{OwnableComponent, OwnableComponent::InternalTrait};
    use starknet::{get_block_timestamp, ClassHash};
    use starknet_gifting::contracts::interface::{
        ITimelockUpgrade, ITimelockUpgradeCallback, ITimelockUpgradeCallbackLibraryDispatcher,
        ITimelockUpgradeCallbackDispatcherTrait
    };

    /// Time before the upgrade can be performed
    const MIN_SECURITY_PERIOD: u64 = 172800; // 7 * 24 * 60 * 60;  // 7 days
    ///  Time window during which the upgrade can be performed
    const VALID_WINDOW_PERIOD: u64 = 604800; // 7 * 24 * 60 * 60;  // 7 days

    #[storage]
    pub struct Storage {
        pending_implementation: ClassHash,
        ready_at: u64,
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
        ready_at: u64
    }

    #[derive(Drop, starknet::Event)]
    struct UpgradeCancelled {
        new_implementation: ClassHash
    }

    #[derive(Drop, starknet::Event)]
    struct Upgraded {
        new_implementation: ClassHash
    }

    #[embeddable_as(TimelockUpgradeImpl)]
    impl TimelockUpgrade<
        TContractState,
        +HasComponent<TContractState>,
        impl Ownable: OwnableComponent::HasComponent<TContractState>,
        +ITimelockUpgradeCallback<TContractState>,
    > of ITimelockUpgrade<ComponentState<TContractState>> {
        fn propose_upgrade(ref self: ComponentState<TContractState>, new_implementation: ClassHash) {
            self.assert_only_owner();
            assert(new_implementation.is_non_zero(), 'upgrade/new-implementation-null');
            self.pending_implementation.write(new_implementation);
            let ready_at = get_block_timestamp() + MIN_SECURITY_PERIOD;
            self.ready_at.write(ready_at);
            self.emit(UpgradeProposed { new_implementation, ready_at });
        }

        fn cancel_upgrade(ref self: ComponentState<TContractState>) {
            self.assert_only_owner();
            let new_implementation = self.pending_implementation.read();
            assert(new_implementation.is_non_zero(), 'upgrade/no-new-implementation');
            assert(self.ready_at.read() != 0, 'upgrade/not-ready');
            self.emit(UpgradeCancelled { new_implementation });
            self.reset_storage();
        }

        fn upgrade(ref self: ComponentState<TContractState>, calldata: Array<felt252>) {
            self.assert_only_owner();
            let new_implementation = self.pending_implementation.read();
            let ready_at = self.ready_at.read();
            let block_timestamp = get_block_timestamp();
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
        }
    }
}
