use argent_gifting::contracts::utils::{StarknetSignature};
use starknet::{ClassHash, ContractAddress};


#[derive(Serde, Drop, Copy, starknet::Store, Debug)]
struct TestGiftData {
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
    fn set_gift_data(
        ref self: TContractState,
        gift: TestGiftData,
        receiver: ContractAddress,
        dust_receiver: ContractAddress,
        claim_signature: StarknetSignature,
    );
}


#[starknet::contract]
mod ReentrantERC20 {
    use argent_gifting::contracts::gift_data::{GiftData};

    use argent_gifting::contracts::gift_factory::{IGiftFactory, IGiftFactoryDispatcher, IGiftFactoryDispatcherTrait};

    use argent_gifting::contracts::utils::ETH_ADDRESS;
    use argent_gifting::contracts::utils::{StarknetSignature};
    use openzeppelin::token::erc20::erc20::ERC20Component::InternalTrait;
    use openzeppelin::token::erc20::interface::{IERC20, IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::token::erc20::{ERC20Component, ERC20HooksEmptyImpl};
    use openzeppelin::utils::serde::SerializedAppend;
    use starknet::{
        get_caller_address, ContractAddress, get_contract_address, contract_address_const,
        syscalls::call_contract_syscall
    };
    use super::IMalicious;
    use super::TestGiftData;


    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;


    #[storage]
    struct Storage {
        factory: ContractAddress,
        gift: TestGiftData,
        receiver: ContractAddress,
        dust_receiver: ContractAddress,
        has_reentered: bool,
        signature: StarknetSignature,
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
            // if (!self.has_reentered.read()) {
            //     self.has_reentered.write(true);
            //     let test_gift: TestGiftData = self.gift.read();
            //     let gift = GiftData {
            //         factory: test_gift.factory,
            //         class_hash: test_gift.class_hash,
            //         sender: test_gift.sender,
            //         gift_token: test_gift.gift_token,
            //         gift_amount: test_gift.gift_amount,
            //         fee_token: test_gift.fee_token,
            //         fee_amount: test_gift.fee_amount,
            //         claim_pubkey: test_gift.claim_pubkey,
            //     };
            // IGiftFactoryDispatcher { contract_address: self.factory.read() }
            //     .claim_external(gift, self.receiver.read(), self.dust_receiver.read(), self.signature.read());
            // }

            self.erc20.transfer(recipient, amount)
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.erc20.ERC20_total_supply.read()
        }
    }

    #[abi(embed_v0)]
    impl MaliciousImpl of IMalicious<ContractState> {
        fn set_gift_data(
            ref self: ContractState,
            gift: TestGiftData,
            receiver: ContractAddress,
            dust_receiver: ContractAddress,
            claim_signature: StarknetSignature,
        ) {
            self.signature.write(claim_signature);
            self.gift.write(gift);
            self.receiver.write(receiver);
            self.dust_receiver.write(dust_receiver);
        }
    }
}
