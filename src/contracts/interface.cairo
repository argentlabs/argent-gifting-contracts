use starknet::{ContractAddress, ClassHash, account::Call};

#[starknet::interface]
pub trait IAccount<TContractState> {
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(self: @TContractState, hash: felt252, signature: Array<felt252>) -> felt252;
    fn supports_interface(self: @TContractState, interface_id: felt252) -> bool;
}

#[derive(Serde, Drop, Copy, starknet::Store)]
pub struct StarknetSignature {
    pub r: felt252,
    pub s: felt252,
}

#[starknet::interface]
pub trait IGiftFactory<TContractState> {
    fn deposit(
        ref self: TContractState,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    );
    fn claim_internal(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);
    fn claim_external(
        ref self: TContractState,
        claim: ClaimData,
        receiver: ContractAddress,
        dust_receiver: ContractAddress,
        signature: StarknetSignature
    );

    fn is_valid_account_signature(
        self: @TContractState, claim: ClaimData, hash: felt252, remaining_signature: Span<felt252>
    ) -> felt252;

    fn perform_execute_from_outside(
        ref self: TContractState,
        claim: ClaimData,
        original_caller: ContractAddress,
        outside_execution: OutsideExecution,
        remaining_signature: Span<felt252>
    ) -> Array<Span<felt252>>;

    fn cancel(ref self: TContractState, claim: ClaimData);
    fn get_dust(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);

    fn get_latest_claim_class_hash(self: @TContractState) -> ClassHash;
    fn get_claim_address(
        self: @TContractState,
        class_hash: ClassHash,
        sender: ContractAddress,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    ) -> ContractAddress;
    fn get_gift_status(self: @TContractState, claim: ClaimData) -> GiftStatus;
}

#[starknet::interface]
pub trait ITimelockUpgrade<TContractState> {
    fn propose_upgrade(ref self: TContractState, new_implementation: ClassHash);
    fn cancel_upgrade(ref self: TContractState);
    fn upgrade(ref self: TContractState, calldata: Array<felt252>);

    fn get_proposed_implementation(self: @TContractState) -> ClassHash;
    fn get_upgrade_ready_at(self: @TContractState) -> u64;
}

#[starknet::interface]
pub trait ITimelockUpgradeCallback<TContractState> {
    fn perform_upgrade(ref self: TContractState, new_implementation: ClassHash, data: Span<felt252>);
}

// TODO Align => Rename ClaimData to Claim OR  claim to claim_data 
// Or even rename to GIFT? so that the user will see gifts in the interface
#[starknet::interface]
pub trait IGiftAccount<TContractState> {
    fn execute_factory_calls(ref self: TContractState, claim: ClaimData, calls: Array<Call>) -> Array<Span<felt252>>;
}

/// @notice As defined in SNIP-9 https://github.com/starknet-io/SNIPs/blob/main/SNIPS/snip-9.md
/// @param caller Only the address specified here will be allowed to call `execute_from_outside`
/// As an exception, to opt-out of this check, the value 'ANY_CALLER' can be used
/// @param nonce It can be any value as long as it's unique. Prevents signature reuse
/// @param execute_after `execute_from_outside` only succeeds if executing after this time
/// @param execute_before `execute_from_outside` only succeeds if executing before this time
/// @param calls The calls that will be executed by the Account
/// Using `Call` here instead of re-declaring `OutsideCall` to avoid the conversion
#[derive(Copy, Drop, Serde)]
pub struct OutsideExecution {
    pub caller: ContractAddress,
    pub nonce: felt252,
    pub execute_after: u64,
    pub execute_before: u64,
    pub calls: Span<Call>
}

#[starknet::interface]
pub trait IOutsideExecution<TContractState> {
    /// @notice Outside execution using SNIP-12 Rev 1 
    fn execute_from_outside_v2(
        ref self: TContractState, outside_execution: OutsideExecution, signature: Span<felt252>
    ) -> Array<Span<felt252>>;

    /// Get the status of a given nonce, true if the nonce is available to use
    fn is_valid_outside_execution_nonce(self: @TContractState, nonce: felt252) -> bool;
}

#[derive(Serde, Drop, Copy)]
pub struct ClaimData {
    pub factory: ContractAddress,
    pub class_hash: ClassHash,
    pub sender: ContractAddress,
    pub gift_token: ContractAddress,
    pub gift_amount: u256,
    pub fee_token: ContractAddress,
    pub fee_amount: u128,
    pub claim_pubkey: felt252
}

#[derive(Serde, Drop, Copy)]
pub struct AccountConstructorArguments {
    pub sender: ContractAddress,
    pub gift_token: ContractAddress,
    pub gift_amount: u256,
    pub fee_token: ContractAddress,
    pub fee_amount: u128,
    pub claim_pubkey: felt252
}

#[derive(Serde, Drop, Copy)]
pub enum GiftStatus {
    ClaimedOrCancelled,
    Ready,
    ReadyExternalOnly
}
