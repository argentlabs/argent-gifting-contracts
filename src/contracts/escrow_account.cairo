use starknet::{ContractAddress, ClassHash, account::Call};

#[starknet::interface]
pub trait IAccount<TContractState> {
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(self: @TContractState, hash: felt252, signature: Array<felt252>) -> felt252;
    fn supports_interface(self: @TContractState, interface_id: felt252) -> bool;
}


#[starknet::interface]
pub trait IEscrowAccount<TContractState> {
    /// @notice delegates an action to the account library
    fn execute_action(ref self: TContractState, selector: felt252, calldata: Array<felt252>) -> Span<felt252>;
}

/// @notice Struct representing the arguments required for constructing an escrow account
/// @dev This will be used to determine the address of the escrow account
/// @param sender The address of the sender
/// @param gift_token The ERC-20 token address of the gift
/// @param gift_amount The amount of the gift
/// @param fee_token The ERC-20 token address of the fee
/// @param fee_amount The amount of the fee
/// @param gift_pubkey The public key associated with the gift
#[derive(Serde, Drop, Copy)]
pub struct AccountConstructorArguments {
    pub sender: ContractAddress,
    pub gift_token: ContractAddress,
    pub gift_amount: u256,
    pub fee_token: ContractAddress,
    pub fee_amount: u128,
    pub gift_pubkey: felt252
}

#[starknet::contract(account)]
mod EscrowAccount {
    use argent_gifting::contracts::escrow_library::{IEscrowLibraryLibraryDispatcher, IEscrowLibraryDispatcherTrait};
    use argent_gifting::contracts::gift_data::GiftData;
    use argent_gifting::contracts::gift_factory::{IGiftFactory, IGiftFactoryDispatcher, IGiftFactoryDispatcherTrait};
    use argent_gifting::contracts::outside_execution::{
        IOutsideExecution, OutsideExecution, ERC165_OUTSIDE_EXECUTION_INTERFACE_ID_VERSION_2
    };

    use argent_gifting::contracts::utils::{
        calculate_escrow_account_address, full_deserialize, serialize, STRK_ADDRESS, ETH_ADDRESS, TX_V1_ESTIMATE, TX_V1,
        TX_V3, TX_V3_ESTIMATE
    };
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::Zero;
    use starknet::{
        TxInfo, account::Call, VALIDATED, syscalls::library_call_syscall, ContractAddress, get_contract_address,
        get_execution_info, ClassHash
    };
    use super::{IEscrowAccount, IAccount, AccountConstructorArguments};

    // https://github.com/starknet-io/SNIPs/blob/main/SNIPS/snip-5.md
    const SRC5_INTERFACE_ID: felt252 = 0x3f918d17e5ee77373b56385708f855659a07f75997f365cf87748628532a055;
    // https://github.com/starknet-io/SNIPs/blob/main/SNIPS/snip-6.md
    const SRC5_ACCOUNT_INTERFACE_ID: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;

    #[storage]
    struct Storage {
        /// Keeps track of used nonces for outside transactions (`execute_from_outside`)
        outside_nonces: LegacyMap<felt252, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {}

    #[constructor]
    fn constructor(ref self: ContractState, args: AccountConstructorArguments) {}

    #[abi(embed_v0)]
    impl IAccountImpl of IAccount<ContractState> {
        fn __validate__(ref self: ContractState, calls: Array<Call>) -> felt252 {
            let execution_info = get_execution_info().unbox();
            assert(execution_info.caller_address.is_zero(), 'escrow/only-protocol');
            assert(calls.len() == 1, 'escrow/invalid-call-len');
            let Call { to, selector, calldata } = calls.at(0);
            assert(*to == get_contract_address(), 'escrow/invalid-call-to');
            assert(*selector == selector!("claim_internal"), 'escrow/invalid-call-selector');
            let (gift, _): (GiftData, ContractAddress) = full_deserialize(*calldata).expect('escrow/invalid-calldata');
            assert_valid_claim(gift);

            let tx_info = execution_info.tx_info.unbox();
            assert(tx_info.nonce == 0, 'escrow/invalid-gift-nonce');
            let execution_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;
            // Not tested
            assert(signature.len() == 2, 'escrow/invalid-signature-len');

            let tx_version = tx_info.version;
            // Not tested
            assert(
                check_ecdsa_signature(execution_hash, gift.gift_pubkey, *signature[0], *signature[1])
                    || tx_version == TX_V3_ESTIMATE
                    || tx_version == TX_V1_ESTIMATE,
                'escrow/invalid-signature'
            );
            if gift.fee_token == STRK_ADDRESS() {
                assert(tx_version == TX_V3 || tx_version == TX_V3_ESTIMATE, 'escrow/invalid-tx3-version');
                let tx_fee = compute_max_fee_v3(tx_info, tx_info.tip);
                assert(tx_fee <= gift.fee_amount, 'escrow/max-fee-too-high-v3');
            } else if gift.fee_token == ETH_ADDRESS() {
                assert(tx_version == TX_V1 || tx_version == TX_V1_ESTIMATE, 'escrow/invalid-tx1-version');
                assert(tx_info.max_fee <= gift.fee_amount, 'escrow/max-fee-too-high-v1');
            } else {
                core::panic_with_felt252('escrow/invalid-token-fee');
            }
            VALIDATED
        }

        fn __execute__(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
            let execution_info = get_execution_info().unbox();
            assert(execution_info.caller_address.is_zero(), 'escrow/only-protocol');
            let tx_version = execution_info.tx_info.unbox().version;
            // Not tested
            assert(
                tx_version == TX_V3
                    || tx_version == TX_V1
                    || tx_version == TX_V3_ESTIMATE
                    || tx_version == TX_V1_ESTIMATE,
                'escrow/invalid-tx-version'
            );
            let Call { .., calldata }: @Call = calls[0];
            // Not tested
            let (gift, receiver): (GiftData, ContractAddress) = full_deserialize(*calldata)
                .expect('escrow/invalid-calldata');
            // The __validate__ function already ensures the claim is valid
            let library_class_hash: ClassHash = IGiftFactoryDispatcher { contract_address: gift.factory }
                .get_escrow_lib_class_hash(gift.escrow_class_hash);
            IEscrowLibraryLibraryDispatcher { class_hash: library_class_hash }.claim_internal(gift, receiver)
        }

        fn is_valid_signature(self: @ContractState, hash: felt252, signature: Array<felt252>) -> felt252 {
            let mut signature_span = signature.span();
            let gift: GiftData = Serde::deserialize(ref signature_span).expect('escrow/invalid-gift');
            get_validated_lib(gift).is_valid_account_signature(gift, hash, signature_span)
        }

        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == SRC5_INTERFACE_ID
                || interface_id == SRC5_ACCOUNT_INTERFACE_ID
                || interface_id == ERC165_OUTSIDE_EXECUTION_INTERFACE_ID_VERSION_2
        }
    }

    #[abi(embed_v0)]
    impl GiftAccountImpl of IEscrowAccount<ContractState> {
        fn execute_action(ref self: ContractState, selector: felt252, calldata: Array<felt252>) -> Span<felt252> {
            let mut calldata_span = calldata.span();
            let gift: GiftData = Serde::deserialize(ref calldata_span).expect('escrow/invalid-gift');
            let lib = get_validated_lib(gift);
            lib.execute_action(lib.class_hash, selector, calldata.span())
        }
    }

    #[abi(embed_v0)]
    impl OutsideExecutionImpl of IOutsideExecution<ContractState> {
        fn execute_from_outside_v2(
            ref self: ContractState, outside_execution: OutsideExecution, mut signature: Span<felt252>
        ) -> Array<Span<felt252>> {
            let gift: GiftData = Serde::deserialize(ref signature).expect('escrow/invalid-gift');
            get_validated_lib(gift).execute_from_outside_v2(gift, outside_execution, signature)
        }

        fn is_valid_outside_execution_nonce(self: @ContractState, nonce: felt252) -> bool {
            !self.outside_nonces.read(nonce)
        }
    }

    fn get_validated_lib(gift: GiftData) -> IEscrowLibraryLibraryDispatcher {
        assert_valid_claim(gift);
        let library_class_hash = IGiftFactoryDispatcher { contract_address: gift.factory }
            .get_escrow_lib_class_hash(gift.escrow_class_hash);
        IEscrowLibraryLibraryDispatcher { class_hash: library_class_hash }
    }

    fn assert_valid_claim(gift: GiftData) {
        let calculated_address = calculate_escrow_account_address(gift);
        assert(calculated_address == get_contract_address(), 'escrow/invalid-escrow-address');
    }

    fn compute_max_fee_v3(tx_info: TxInfo, tip: u128) -> u128 {
        let mut resource_bounds = tx_info.resource_bounds;
        let mut max_fee: u128 = 0;
        let mut max_tip: u128 = 0;
        while let Option::Some(r) = resource_bounds
            .pop_front() {
                let max_resource_amount: u128 = (*r.max_amount).into();
                max_fee += *r.max_price_per_unit * max_resource_amount;
                if *r.resource == 'L2_GAS' {
                    max_tip += tip * max_resource_amount;
                }
            };
        max_fee + max_tip
    }
}
