#[starknet::interface]
pub trait IMalicious<TContractState> {
    fn set_signature(ref self: TContractState, claim_signature: Array<felt252>);
}


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
    use super::IMalicious;


    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;


    #[storage]
    struct Storage {
        factory: ContractAddress,
        signature: (felt252, felt252),
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
            self.erc20.transfer_from(sender, recipient, amount)
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
            let sender = get_caller_address();
            let claim = ClaimData {
                factory: self.factory.read(),
                class_hash: 0x71b6334f3a131fb8f120221c849965f0bb2a31906a0361e06e492e8de5ebf63.try_into().unwrap(),
                sender: sender,
                gift_token: get_contract_address(),
                gift_amount: amount,
                fee_token: ETH_ADDRESS(),
                fee_amount: 50000000000000,
                claim_pubkey: 3512654880572580671014088124487384125967296770469815068887364768195237224797 // pk of 0x123456
            };

            let (sig_r, sig_s) = self.signature.read();

            let mut calldata: Array<felt252> = array![];
            calldata.append_serde(claim);
            calldata.append_serde(contract_address_const::<9999>());
            calldata.append_serde(array![sig_r, sig_s]);

            starknet::SyscallResultTrait::unwrap_syscall(
                call_contract_syscall(self.factory.read(), selector!("claim_external"), calldata.span(),)
            );
            true
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.erc20.ERC20_total_supply.read()
        }
    }

    #[abi(embed_v0)]
    impl MaliciousImpl of IMalicious<ContractState> {
        fn set_signature(ref self: ContractState, claim_signature: Array<felt252>) {
            self.signature.write((*claim_signature[0], *claim_signature[1]));
        }
    }
}
