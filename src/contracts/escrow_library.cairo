use argent_gifting::contracts::gift_data::GiftData;
use argent_gifting::contracts::outside_execution::OutsideExecution;
use argent_gifting::contracts::utils::StarknetSignature;
use starknet::{ContractAddress, ClassHash};

#[starknet::interface]
pub trait IEscrowLibrary<TContractState> {
    fn execute_action(
        ref self: TContractState, this_class_hash: ClassHash, selector: felt252, args: Span<felt252>
    ) -> Span<felt252>;

    fn claim_internal(ref self: TContractState, gift: GiftData, receiver: ContractAddress) -> Array<Span<felt252>>;

    fn claim_external(
        ref self: TContractState,
        gift: GiftData,
        receiver: ContractAddress,
        dust_receiver: ContractAddress,
        signature: StarknetSignature
    );

    /// @notice Allows the sender of a gift to cancel their gift
    /// @dev Will refund both the gift and the fee
    /// @param gift The data of the gift to cancel
    fn cancel(ref self: TContractState, gift: GiftData);

    /// @notice Allows the owner of the factory to claim the dust (leftovers) of a gift
    /// @dev Only allowed if the gift has been claimed
    /// @param gift The gift data 
    /// @param receiver The address of the receiver
    fn claim_dust(ref self: TContractState, gift: GiftData, receiver: ContractAddress);

    fn is_valid_account_signature(
        self: @TContractState, gift: GiftData, hash: felt252, remaining_signature: Span<felt252>
    ) -> felt252;

    fn execute_from_outside_v2(
        ref self: TContractState, gift: GiftData, outside_execution: OutsideExecution, signature: Span<felt252>
    ) -> Array<Span<felt252>>;
}

#[starknet::contract]
mod EscrowLibrary {
    use argent_gifting::contracts::claim_hash::{ClaimExternal, IOffChainMessageHashRev1};
    use argent_gifting::contracts::gift_data::GiftData;
    use argent_gifting::contracts::outside_execution::OutsideExecution;
    use argent_gifting::contracts::utils::StarknetSignature;
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::zero::Zero;
    use core::panic_with_felt252;
    use openzeppelin::access::ownable::interface::{IOwnable, IOwnableDispatcherTrait, IOwnableDispatcher};
    use openzeppelin::token::erc20::interface::{IERC20, IERC20DispatcherTrait, IERC20Dispatcher};
    use starknet::{
        ClassHash, ContractAddress, get_caller_address, get_contract_address, syscalls::library_call_syscall
    };

    #[storage]
    struct Storage {}

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        GiftClaimed: GiftClaimed,
        GiftCancelled: GiftCancelled,
    }

    #[derive(Drop, starknet::Event)]
    struct GiftClaimed {
        receiver: ContractAddress,
        dust_receiver: ContractAddress
    }

    #[derive(Drop, starknet::Event)]
    struct GiftCancelled {}

    #[constructor]
    fn constructor(ref self: ContractState) {
        // This prevents creating instances of this classhash by mistake, as it's not needed. 
        // While it is technically possible to create instances by replacing classhashes, this practice is not recommended. 
        // This contract is intended to be used exclusively through library calls.
        panic_with_felt252('instances-not-recommended')
    }

    #[abi(embed_v0)]
    impl EscrowLibraryImpl of super::IEscrowLibrary<ContractState> {
        fn claim_internal(ref self: ContractState, gift: GiftData, receiver: ContractAddress) -> Array<Span<felt252>> {
            self.proceed_with_claim(gift, receiver, Zero::zero());
            array![]
        }

        fn execute_action(
            ref self: ContractState, this_class_hash: ClassHash, selector: felt252, args: Span<felt252>
        ) -> Span<felt252> {
            // This is needed to make sure no arbitrary methods can be called directly using `execute_action` in the escrow account
            // Some methods like `claim_internal` should only be called after some checks are performed in the escrow account
            let is_whitelisted = selector == selector!("claim_external")
                || selector == selector!("claim_dust")
                || selector == selector!("cancel");
            assert(is_whitelisted, 'gift/invalid-selector');
            library_call_syscall(this_class_hash, selector, args).unwrap()
        }

        fn claim_external(
            ref self: ContractState,
            gift: GiftData,
            receiver: ContractAddress,
            dust_receiver: ContractAddress,
            signature: StarknetSignature
        ) {
            let claim_external_hash = ClaimExternal { receiver, dust_receiver }
                .get_message_hash_rev_1(get_contract_address());
            assert(
                check_ecdsa_signature(claim_external_hash, gift.gift_pubkey, signature.r, signature.s),
                'gift/invalid-ext-signature'
            );
            self.proceed_with_claim(gift, receiver, dust_receiver);
        }

        fn cancel(ref self: ContractState, gift: GiftData) {
            let contract_address = get_contract_address();
            assert(get_caller_address() == gift.sender, 'gift/wrong-sender');

            let gift_balance = balance_of(gift.gift_token, contract_address);
            assert(gift_balance > 0, 'gift/already-claimed');
            if gift.gift_token == gift.fee_token {
                // Sender also gets the dust
                transfer_from_account(gift.gift_token, gift.sender, gift_balance);
            } else {
                // Transfer both tokens
                let fee_balance = balance_of(gift.fee_token, contract_address);
                transfer_from_account(gift.gift_token, gift.sender, gift_balance);
                transfer_from_account(gift.fee_token, gift.sender, fee_balance);
            }
            self.emit(GiftCancelled {});
        }

        fn claim_dust(ref self: ContractState, gift: GiftData, receiver: ContractAddress) {
            let contract_address = get_contract_address();
            let factory_owner = IOwnableDispatcher { contract_address: gift.factory }.owner();
            assert(factory_owner == get_caller_address(), 'gift/only-factory-owner');
            let gift_balance = balance_of(gift.gift_token, contract_address);
            assert(gift_balance < gift.gift_amount, 'gift/not-yet-claimed');
            if gift.gift_token == gift.fee_token {
                transfer_from_account(gift.gift_token, receiver, gift_balance);
            } else {
                let fee_balance = balance_of(gift.fee_token, contract_address);
                transfer_from_account(gift.fee_token, gift.sender, fee_balance);
            }
        }

        fn is_valid_account_signature(
            self: @ContractState, gift: GiftData, hash: felt252, mut remaining_signature: Span<felt252>
        ) -> felt252 {
            0 // Accounts don't support off-chain signatures yet
        }

        fn execute_from_outside_v2(
            ref self: ContractState, gift: GiftData, outside_execution: OutsideExecution, signature: Span<felt252>
        ) -> Array<Span<felt252>> {
            panic_with_felt252('not-allowed-yet')
        }
    }

    #[generate_trait]
    impl Private of PrivateTrait {
        fn proceed_with_claim(
            ref self: ContractState, gift: GiftData, receiver: ContractAddress, dust_receiver: ContractAddress
        ) {
            assert(receiver.is_non_zero(), 'gift/zero-receiver');
            let contract_address = get_contract_address();
            let gift_balance = balance_of(gift.gift_token, contract_address);
            assert(gift_balance >= gift.gift_amount, 'gift/already-claimed-or-cancel');

            // could be optimized to 1 transfer only when the receiver is also the dust receiver,
            // and the fee token is the same as the gift token
            // but will increase the complexity of the code for a small performance

            // Transfer the gift
            transfer_from_account(gift.gift_token, receiver, gift.gift_amount);

            // Transfer the dust
            if dust_receiver.is_non_zero() {
                let dust = if gift.gift_token == gift.fee_token {
                    gift_balance - gift.gift_amount
                } else {
                    balance_of(gift.fee_token, contract_address)
                };
                if dust > 0 {
                    transfer_from_account(gift.fee_token, dust_receiver, dust);
                }
            }
            self.emit(GiftClaimed { receiver, dust_receiver });
        }
    }

    fn transfer_from_account(token: ContractAddress, receiver: ContractAddress, amount: u256,) {
        assert(IERC20Dispatcher { contract_address: token }.transfer(receiver, amount), 'gift/transfer-failed');
    }

    fn balance_of(token: ContractAddress, account: ContractAddress) -> u256 {
        IERC20Dispatcher { contract_address: token }.balance_of(account)
    }
}
