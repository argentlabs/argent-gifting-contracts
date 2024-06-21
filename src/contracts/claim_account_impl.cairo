use starknet::{
    ClassHash, ContractAddress, syscalls::deploy_syscall, get_caller_address, get_contract_address, account::Call,
    get_block_timestamp
};
use starknet_gifting::contracts::interface::{
    IGiftAccountDispatcherTrait, IGiftFactory, ClaimData, AccountConstructorArguments, IGiftAccountDispatcher,
    OutsideExecution, StarknetSignature
};


#[starknet::interface]
pub trait IClaimAccountImpl<TContractState> {
    fn claim_internal(ref self: TContractState, claim: ClaimData, receiver: ContractAddress) -> Array<Span<felt252>>;
    fn claim_external(
        ref self: TContractState,
        claim: ClaimData,
        receiver: ContractAddress,
        dust_receiver: ContractAddress,
        signature: StarknetSignature
    );

    /// @notice Allows the sender of a gift to cancel their gift
    /// @dev Will refund both the gift and the fee
    /// @param claim The claim data of the gift to cancel
    fn cancel(ref self: TContractState, claim: ClaimData);

    /// @notice Allows the owner of the factory to claim the dust (leftovers) of a claim
    /// @dev Only allowed if the gift has been claimed
    /// @param claim The claim data 
    /// @param receiver The address of the receiver
    fn get_dust(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);

    fn is_valid_account_signature(
        self: @TContractState, claim: ClaimData, hash: felt252, remaining_signature: Span<felt252>
    ) -> felt252;

    fn execute_from_outside_v2(
        ref self: TContractState, claim: ClaimData, outside_execution: OutsideExecution, signature: Span<felt252>
    ) -> Array<Span<felt252>>;
}

#[starknet::contract]
mod ClaimAccountImpl {
    use core::ecdsa::check_ecdsa_signature;
    use core::num::traits::zero::Zero;
    use core::panic_with_felt252;
    use openzeppelin::access::ownable::interface::{IOwnable, IOwnableDispatcherTrait, IOwnableDispatcher};
    use openzeppelin::token::erc20::interface::{IERC20, IERC20DispatcherTrait, IERC20Dispatcher};
    use starknet::{
        ClassHash, ContractAddress, syscalls::deploy_syscall, get_caller_address, get_contract_address, account::Call,
        get_block_timestamp
    };


    use starknet_gifting::contracts::claim_hash::{ClaimExternal, IOffChainMessageHashRev1};
    use starknet_gifting::contracts::interface::{
        IGiftAccountDispatcherTrait, IGiftFactory, ClaimData, AccountConstructorArguments, IGiftAccountDispatcher,
        OutsideExecution, StarknetSignature
    };
    use starknet_gifting::contracts::timelock_upgrade::{ITimelockUpgradeCallback, TimelockUpgradeComponent};
    use starknet_gifting::contracts::utils::{
        calculate_claim_account_address, STRK_ADDRESS, ETH_ADDRESS, serialize, full_deserialize, execute_multicall
    };

    #[storage]
    struct Storage {
        /// Keeps track of used nonces for outside transactions (`execute_from_outside`)
        outside_nonces: LegacyMap<felt252, bool>,
    }

    #[derive(Drop, Copy)]
    struct TransferFromAccount {
        token: ContractAddress,
        amount: u256,
        receiver: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        GiftClaimed: GiftClaimed,
        GiftCancelled: GiftCancelled,
    }

    #[derive(Drop, starknet::Event)]
    struct GiftClaimed {
        #[key]
        gift_address: ContractAddress,
        receiver: ContractAddress,
        dust_receiver: ContractAddress
    }

    #[derive(Drop, starknet::Event)]
    struct GiftCancelled {
        #[key]
        gift_address: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        panic_with_felt252('not-allowed');
    }

    #[abi(embed_v0)]
    impl Impl of super::IClaimAccountImpl<ContractState> {
        fn claim_internal(
            ref self: ContractState, claim: ClaimData, receiver: ContractAddress
        ) -> Array<Span<felt252>> {
            self.proceed_with_claim(claim, receiver, Zero::zero());
            array![]
        }

        fn claim_external(
            ref self: ContractState,
            claim: ClaimData,
            receiver: ContractAddress,
            dust_receiver: ContractAddress,
            signature: StarknetSignature
        ) {
            let claim_external_hash = ClaimExternal { receiver, dust_receiver }
                .get_message_hash_rev_1(get_contract_address());
            assert(
                check_ecdsa_signature(claim_external_hash, claim.claim_pubkey, signature.r, signature.s),
                'gift/invalid-ext-signature'
            );
            self.proceed_with_claim(claim, receiver, dust_receiver);
        }

        fn cancel(ref self: ContractState, claim: ClaimData) {
            let contract_address = get_contract_address();
            assert(get_caller_address() == claim.sender, 'gift/wrong-sender');

            let gift_balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(contract_address);
            assert(gift_balance > 0, 'gift/already-claimed');
            if claim.gift_token == claim.fee_token {
                // Sender also gets the dust
                self.transfer_from_account(claim.gift_token, gift_balance, claim.sender);
            } else {
                // Transfer both tokens in a multicall
                let fee_balance = IERC20Dispatcher { contract_address: claim.fee_token }.balance_of(contract_address);
                self.transfer_from_account(claim.gift_token, gift_balance, claim.sender);
                self.transfer_from_account(claim.fee_token, fee_balance, claim.sender);
            }
            self.emit(GiftCancelled { gift_address: contract_address });
        }

        fn get_dust(ref self: ContractState, claim: ClaimData, receiver: ContractAddress) {
            let contract_address = get_contract_address();
            let factory_owner = IOwnableDispatcher { contract_address: claim.factory }.owner();
            assert(factory_owner == get_caller_address(), 'gift/openzeppelin');
            let gift_balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(contract_address);
            assert(gift_balance < claim.gift_amount, 'gift/not-yet-claimed');
            if claim.gift_token == claim.fee_token {
                self.transfer_from_account(claim.gift_token, gift_balance, receiver);
            } else {
                let fee_balance = IERC20Dispatcher { contract_address: claim.fee_token }.balance_of(contract_address);
                self.transfer_from_account(claim.fee_token, fee_balance, claim.sender);
            }
        }

        fn is_valid_account_signature(
            self: @ContractState, claim: ClaimData, hash: felt252, mut remaining_signature: Span<felt252>
        ) -> felt252 {
            0 // Accounts don't support offchain signatures now, but it could
        }

        fn execute_from_outside_v2(
            ref self: ContractState, claim: ClaimData, outside_execution: OutsideExecution, signature: Span<felt252>
        ) -> Array<Span<felt252>> {
            panic_with_felt252('not-allowed-yet');
            array![]
        // assert(!self.outside_nonces.read(outside_execution.nonce), 'gift-acc/dup-outside-nonce');
        // self.outside_nonces.write(outside_execution.nonce, true);

        // // TODO hashing
        // let claim_external_hash = 0x1236;
        // // let hash = outside_execution.get_message_hash_rev_1(claim_address);

        // let (r, s): (felt252, felt252) = full_deserialize(signature).expect('gift-fact/invalid-signature');
        // assert(
        //     check_ecdsa_signature(claim_external_hash, claim.claim_pubkey, r, s), 'gift-fact/invalid-out-signature'
        // );

        // if outside_execution.caller.into() != 'ANY_CALLER' {
        //     assert(get_caller_address() == outside_execution.caller, 'argent/invalid-caller');
        // }

        // let block_timestamp = get_block_timestamp();
        // assert(
        //     outside_execution.execute_after < block_timestamp && block_timestamp < outside_execution.execute_before,
        //     'argent/invalid-timestamp'
        // );

        // assert(outside_execution.calls.len() == 2, 'gift-fact/call-len');
        // // validate 1st call
        // let refund_call = outside_execution.calls.at(0);
        // assert(*refund_call.selector == selector!("transfer"), 'gift-fact/refcall-selector');
        // assert(*refund_call.to == claim.fee_token, 'gift-fact/refcall-to');
        // let (refund_receiver, refund_amount): (ContractAddress, u256) = full_deserialize(*refund_call.calldata)
        //     .expect('gift-fact/invalid-ref-calldata');
        // assert(refund_receiver.is_non_zero(), 'gift-fact/refcall-receiver');
        // assert(refund_amount <= claim.fee_amount.into(), 'gift-fact/refcall-amount');
        // // validate 2nd call
        // let claim_call = outside_execution.calls.at(1);
        // assert(*claim_call.to == claim.factory, 'gift-fact/claimcall-to');
        // // TODO ideally the function claim_from_outside actually exists in the factory to help with the gas estimation
        // assert(*claim_call.selector == selector!("claim_from_outside"), 'gift-fact/claimcall-to');
        // let (claim_receiver, dust_receiver): (ContractAddress, ContractAddress) = full_deserialize(
        //     *refund_call.calldata
        // )
        //     .expect('gift-fact/claimcall-calldata');

        // // Proceed with the calls
        // // We could optimize and make only one call to `execute_factory_calls`
        // self.transfer_from_account(claim.fee_token, refund_amount, refund_receiver);
        // self.proceed_with_claim(claim_receiver, dust_receiver);
        // array![
        //     serialize(@(true)).span(), // simulated return from the transfer call
        //     array![].span() // return from the claim call
        // ]
        }
    }

    #[generate_trait]
    impl Private of PrivateTrait {
        fn proceed_with_claim(
            ref self: ContractState, claim: ClaimData, receiver: ContractAddress, dust_receiver: ContractAddress
        ) {
            assert(receiver.is_non_zero(), 'gift/zero-receiver');
            let contract_address = get_contract_address();
            let gift_balance = IERC20Dispatcher { contract_address: claim.gift_token }.balance_of(contract_address);
            assert(gift_balance >= claim.gift_amount, 'gift/already-claimed-or-cancel');

            // could be optimized to 1 transfer only when the receiver is also the dust receiver, and the fee token is the same as the gift token
            // but will increase the complexity of the code for a small performance GiftCanceled

            // Transfer the gift
            self.transfer_from_account(claim.gift_token, claim.gift_amount, receiver);

            // Transfer the dust
            if dust_receiver.is_non_zero() {
                let dust = if claim.gift_token == claim.fee_token {
                    gift_balance - claim.gift_amount
                } else {
                    IERC20Dispatcher { contract_address: claim.fee_token }.balance_of(contract_address)
                };
                if dust > 0 {
                    self.transfer_from_account(claim.fee_token, dust, dust_receiver);
                }
            }
            self.emit(GiftClaimed { gift_address: contract_address, receiver, dust_receiver });
        }

        fn transfer_from_account(
            self: @ContractState, token: ContractAddress, amount: u256, receiver: ContractAddress,
        ) {
            assert(IERC20Dispatcher { contract_address: token }.transfer(receiver, amount), 'gift/transfer-failed');
        }
    }
}
