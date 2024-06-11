#[starknet::contract]
mod ReentrantERC20 {
    use openzeppelin::token::erc20::interface::IERC20;
    use openzeppelin::token::erc20::{ERC20Component, ERC20HooksEmptyImpl};
    use openzeppelin::utils::serde::SerializedAppend;
    use starknet::{
        get_caller_address, ContractAddress, get_contract_address, contract_address_const,
        syscalls::call_contract_syscall
    };
    use starknet_gifting::contracts::interface::ClaimData;
    use starknet_gifting::contracts::utils::ETH_ADDRESS;


    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;


    #[storage]
    struct Storage {
        factory: ContractAddress,
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    /// Assigns `owner` as the contract owner.
    /// Sets the token `name` and `symbol`.
    /// Mints `fixed_supply` tokens to `recipient`.
    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: ByteArray,
        symbol: ByteArray,
        fixed_supply: u256,
        recipient: ContractAddress,
        factory: ContractAddress
    ) {
        self.factory.write(factory);
        self.erc20.initializer(name, symbol);
        self.erc20._mint(recipient, fixed_supply);
    }

    #[abi(embed_v0)]
    impl Erc20MockImpl of IERC20<ContractState> {
        fn transfer_from(
            ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256
        ) -> bool {
            let claim = ClaimData {
                factory: self.factory.read(),
                class_hash: 0x48acb707978d9d5b886b6d97247cd4a84ab8475398c3437886c6d95f48225ef.try_into().unwrap(),
                sender: sender,
                gift_token: get_contract_address(),
                gift_amount: amount,
                fee_token: ETH_ADDRESS(),
                fee_amount: 50000000000000,
                claim_pubkey: 1834667920135899136652385032488963423519980789164354435124006945514052083514 // pk of 0x123456
            };

            let mut calldata: Array<felt252> = array![];
            calldata.append_serde(claim);
            calldata.append_serde(contract_address_const::<9999>());

            starknet::SyscallResultTrait::unwrap_syscall(
                call_contract_syscall(self.factory.read(), selector!("claim_internal"), calldata.span(),)
            );
            true
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            self.erc20.ERC20_allowances.write((caller, spender), amount);
            true
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.erc20.ERC20_balances.read(account)
        }

        fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 {
            self.erc20.ERC20_allowances.read((owner, spender))
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            let caller_balance = self.erc20.ERC20_balances.read(caller);
            if caller_balance < amount {
                return false;
            }
            self.erc20.ERC20_balances.write(caller, caller_balance - amount);
            let recipient_balance = self.erc20.ERC20_balances.read(recipient);
            self.erc20.ERC20_balances.write(recipient, recipient_balance + amount);
            true
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.erc20.ERC20_total_supply.read()
        }
    }
}
