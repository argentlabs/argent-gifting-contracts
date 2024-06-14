use starknet::{ClassHash, ContractAddress};

#[derive(Serde, Drop, Copy, starknet::Store, Debug)]
struct TestClaimData {
    factory: ContractAddress,
    class_hash: ClassHash,
    sender: ContractAddress,
    gift_token: ContractAddress,
    gift_amount: u256,
    fee_token: ContractAddress,
    fee_amount: u128,
    claim_pubkey: felt252
}

#[starknet::interface]
trait IMalicious<TContractState> {
    fn set_claim_data(
        ref self: TContractState, claim: TestClaimData, receiver: ContractAddress, claim_signature: Array<felt252>
    );
}


#[starknet::contract]
mod ReentrantERC20 {
    use openzeppelin::token::erc20::erc20::ERC20Component::InternalTrait;
use openzeppelin::token::erc20::interface::{IERC20, IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::token::erc20::{ERC20Component, ERC20HooksEmptyImpl};
    use openzeppelin::utils::serde::SerializedAppend;
    use starknet::{
        get_caller_address, ContractAddress, get_contract_address, contract_address_const,
        syscalls::call_contract_syscall
    };
    use starknet_gifting::contracts::interface::{ClaimData, IGiftFactoryDispatcher, IGiftFactoryDispatcherTrait};
    use starknet_gifting::contracts::utils::ETH_ADDRESS;
    use super::IMalicious;
    use super::TestClaimData;


    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;


    #[storage]
    struct Storage {
        factory: ContractAddress,
        claim: TestClaimData,
        receiver: ContractAddress,
        has_reentered: bool,
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
        factory: ContractAddress,
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
            if (!self.has_reentered.read()) {
                self.has_reentered.write(true);
                let (sig_r, sig_s) = self.signature.read();
                let test_claim: TestClaimData = self.claim.read();
                let claim = ClaimData {
                    factory: test_claim.factory,
                    class_hash: test_claim.class_hash,
                    sender: test_claim.sender,
                    gift_token: test_claim.gift_token,
                    gift_amount: test_claim.gift_amount,
                    fee_token: test_claim.fee_token,
                    fee_amount: test_claim.fee_amount,
                    claim_pubkey: test_claim.claim_pubkey,
                };
        
                IGiftFactoryDispatcher { contract_address: self.factory.read() }
                    .claim_external(claim, self.receiver.read(), array![sig_r, sig_s]);
                
            }

            self.erc20._transfer(get_caller_address(), recipient, amount);

            true
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.erc20.ERC20_total_supply.read()
        }
    }

    #[abi(embed_v0)]
    impl MaliciousImpl of IMalicious<ContractState> {
        fn set_claim_data(
            ref self: ContractState, claim: TestClaimData, receiver: ContractAddress, claim_signature: Array<felt252>
        ) {
            self.signature.write((*claim_signature[0], *claim_signature[1]));
            self.claim.write(claim);
            self.receiver.write(receiver);
        }
    }
}
