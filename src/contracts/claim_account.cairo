#[starknet::contract(account)]
mod ClaimAccount {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::Zero;
    use starknet::{
        TxInfo, account::Call, VALIDATED, syscalls::call_contract_syscall, ContractAddress, get_contract_address,
        get_caller_address, get_execution_info
    };
    use starknet_gifting::contracts::claim_utils::calculate_claim_account_address;
    use starknet_gifting::contracts::interface::{
        IAccount, IGiftAccount, IOutsideExecution, OutsideExecution, ClaimData, AccountConstructorArguments,
        IGiftFactory, IGiftFactoryDispatcher, IGiftFactoryDispatcherTrait
    };
    use starknet_gifting::contracts::utils::{
        full_deserialize, STRK_ADDRESS, ETH_ADDRESS, TX_V1_ESTIMATE, TX_V1, TX_V3, TX_V3_ESTIMATE, execute_multicall
    };

    #[storage]
    struct Storage {}

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {}

    #[constructor]
    fn constructor(ref self: ContractState, args: AccountConstructorArguments) {}

    #[abi(embed_v0)]
    impl IAccountImpl of IAccount<ContractState> {
        fn __validate__(ref self: ContractState, calls: Array<Call>) -> felt252 {
            let execution_info = get_execution_info().unbox();
            assert(execution_info.caller_address.is_zero(), 'gift-acc/only-protocol');
            assert(calls.len() == 1, 'gift-acc/invalid-call-len');
            let Call { to, selector, calldata } = calls.at(0);
            assert(*selector == selector!("claim_internal"), 'gift-acc/invalid-call-selector');
            let (claim, _): (ClaimData, ContractAddress) = full_deserialize(*calldata)
                .expect('gift-acc/invalid-calldata');
            assert(*to == claim.factory, 'gift-acc/invalid-call-to');
            assert_valid_claim(claim);

            let tx_info = execution_info.tx_info.unbox();
            assert(tx_info.nonce == 0, 'gift-acc/invalid-claim-nonce');
            let execution_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;
            assert(signature.len() == 2, 'gift-acc/invalid-signature-len');

            let tx_version = tx_info.version;
            assert(
                check_ecdsa_signature(execution_hash, claim.claim_pubkey, *signature[0], *signature[1])
                    || tx_version == TX_V3_ESTIMATE
                    || tx_version == TX_V1_ESTIMATE,
                'invalid-signature'
            );
            if claim.fee_token == STRK_ADDRESS() {
                assert(tx_version == TX_V3 || tx_version == TX_V3_ESTIMATE, 'gift-acc/invalid-tx3-version');
                let tx_fee = compute_max_fee_v3(tx_info, tx_info.tip);
                assert(tx_fee <= claim.fee_amount, 'gift-acc/max-fee-too-high-v3');
            } else if claim.fee_token == ETH_ADDRESS() {
                assert(tx_version == TX_V1 || tx_version == TX_V1_ESTIMATE, 'gift-acc/invalid-tx1-version');
                assert(tx_info.max_fee <= claim.fee_amount, 'gift-acc/max-fee-too-high-v1');
            } else {
                core::panic_with_felt252('gift-acc/invalid-token');
            }
            VALIDATED
        }

        fn __execute__(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
            let execution_info = get_execution_info().unbox();
            assert(execution_info.caller_address.is_zero(), 'gift-acc/only-protocol');
            let Call { to, selector, calldata }: @Call = calls[0];
            call_contract_syscall(*to, *selector, *calldata).expect('gift-acc/execute-failed');
            array![]
        }

        fn is_valid_signature(self: @ContractState, hash: felt252, signature: Array<felt252>) -> felt252 {
            0
        }
    }

    #[abi(embed_v0)]
    impl GiftAccountImpl of IGiftAccount<ContractState> {
        fn execute_factory_calls(
            ref self: ContractState, claim: ClaimData, mut calls: Array<Call>
        ) -> Array<Span<felt252>> {
            assert_valid_claim(claim);
            assert(get_caller_address() == claim.factory, 'gift/only-factory');
            execute_multicall(calls.span())
        }
    }

    #[abi(embed_v0)]
    impl OutsideExecutionImpl of IOutsideExecution<ContractState> {
        // TODO implement supports_interface
        fn execute_from_outside_v2(
            ref self: ContractState, outside_execution: OutsideExecution, signature: Span<felt252>
        ) -> Array<Span<felt252>> {
            let mut signature_copy = signature;
            let claim: ClaimData = Serde::deserialize(ref signature_copy).expect('gift-acc/invalid-claim');
            assert_valid_claim(claim);
            IGiftFactoryDispatcher { contract_address: claim.factory }
                .perform_execute_from_outside(claim, get_caller_address(), outside_execution, signature)
        }

        fn is_valid_outside_execution_nonce(self: @ContractState, nonce: felt252) -> bool {
            true // TODO delegate to factory
        }
    }

    fn assert_valid_claim(claim: ClaimData) {
        let calculated_address = calculate_claim_account_address(claim);
        assert(calculated_address == get_contract_address(), 'gift-acc/invalid-claim-address');
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
