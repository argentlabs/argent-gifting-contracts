use starknet::{ClassHash, ContractAddress};

#[starknet::contract]
mod FutureFactory {
    use argent_gifting::contracts::timelock_upgrade::{ITimelockUpgradeCallback, TimelockUpgradeComponent};
    use core::panic_with_felt252;
    use openzeppelin::access::ownable::OwnableComponent;
    use starknet::account::Call;
    use starknet::syscalls::deploy_syscall;
    use starknet::{ClassHash, ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};

    // Ownable
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;

    // TimelockUpgradeable
    component!(path: TimelockUpgradeComponent, storage: timelock_upgrade, event: TimelockUpgradeEvent);
    #[abi(embed_v0)]
    impl TimelockUpgradeImpl = TimelockUpgradeComponent::TimelockUpgradeImpl<ContractState>;
    impl TimelockUpgradeInternalImpl = TimelockUpgradeComponent::TimelockUpgradeInternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        timelock_upgrade: TimelockUpgradeComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        TimelockUpgradeEvent: TimelockUpgradeComponent::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {}


    #[external(v0)]
    fn get_num(self: @ContractState) -> u128 {
        1
    }

    #[abi(embed_v0)]
    impl TimelockUpgradeCallbackImpl of ITimelockUpgradeCallback<ContractState> {
        fn perform_upgrade(ref self: ContractState, new_implementation: ClassHash, data: Array<felt252>) {
            self.timelock_upgrade.assert_and_reset_lock();
            starknet::syscalls::replace_class_syscall(new_implementation).unwrap();
            self.timelock_upgrade.emit_upgrade_executed(new_implementation, data);
        }
    }
}

