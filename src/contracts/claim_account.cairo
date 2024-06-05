#[starknet::contract(account)]
mod ClaimAccount {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::Zero;
    use core::starknet::event::EventEmitter;
    use core::traits::TryInto;
    use openzeppelin::token::erc20::interface::{IERC20, IERC20DispatcherTrait, IERC20Dispatcher};
    use starknet::{
        ClassHash, account::Call, VALIDATED, call_contract_syscall, ContractAddress, get_contract_address,
        get_caller_address, contract_address::contract_address_const, get_execution_info
    };
    use starknet_gifting::contracts::claim_hash::{ClaimExternal, IOffChainMessageHashRev1};
    use starknet_gifting::contracts::claim_utils::calculate_claim_account_address;
    use starknet_gifting::contracts::interface::{IAccount, IGiftAccount, ClaimData, AccountConstructorArguments};
    use starknet_gifting::contracts::utils::{
        full_deserialize, STRK_ADDRESS, ETH_ADDRESS, TX_V1_ESTIMATE, TX_V1, TX_V3, TX_V3_ESTIMATE, compute_max_fee_v3,
        execute_multicall
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
            self.assert_valid_claim(claim);

            let tx_info = execution_info.tx_info.unbox();
            // Isn't it an issue if for some reason it fails during execution?
            // Like if the gas is not enough?
            // Nonce will be incremented and the account will be unusable
            assert(tx_info.nonce == 0, 'gift-acc/invalid-claim-nonce');
            let execution_hash = tx_info.transaction_hash;
            let signature = tx_info.signature;
            assert(signature.len() == 2, 'gift-acc/invalid-signature-len');
            // Should we allow while in estimation?
            assert(
                check_ecdsa_signature(execution_hash, claim.claim_pubkey, *signature[0], *signature[1]),
                'invalid-signature'
            );
            let tx_version = tx_info.version;
            if claim.token == STRK_ADDRESS() {
                assert(tx_version == TX_V3 || tx_version == TX_V3_ESTIMATE, 'gift-acc/invalid-tx3-version');
                let tx_fee = compute_max_fee_v3(tx_info.resource_bounds, tx_info.tip);
                // TODO: should this error be max fee too high?
                assert(tx_fee <= claim.max_fee, 'gift-acc/insufficient-v3-fee');
            } else if claim.token == ETH_ADDRESS() {
                assert(tx_version == TX_V1 || tx_version == TX_V1_ESTIMATE, 'gift-acc/invalid-tx1-version');
                // TODO: should this error be max fee too high?
                assert(tx_info.max_fee <= claim.max_fee, 'gift-acc/insufficient-v1-fee');
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
            self.assert_valid_claim(claim);
            assert(get_caller_address() == claim.factory, 'gift/only-factory');
            execute_multicall(calls.span())
        }
    }

    #[generate_trait]
    impl Private of PrivateTrait {
        fn assert_valid_claim(self: @ContractState, claim: ClaimData) {
            let calculated_address = calculate_claim_account_address(claim);
            assert(calculated_address == get_contract_address(), 'gift-acc/invalid-claim-address');
        }
    }
}
