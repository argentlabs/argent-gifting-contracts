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
    /// @notice Creates a new claim
    /// @dev This function can be paused by the owner of the factory and prevent any further deposits
    /// @param gift_token The ERC-20 token address of the gift
    /// @param gift_amount The amount of the gift
    /// @param fee_token The ERC-20 token address of the fee (can ONLY be ETH or STARK address) used to claim the gift through claim_internal
    /// @param fee_amount The amount of the fee
    /// @param claim_pubkey The public key associated with the gift
    fn deposit(
        ref self: TContractState,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    );

    /// @notice Retrieve the current class_hash used for creating a gift account
    fn get_latest_claim_class_hash(self: @TContractState) -> ClassHash;

    fn get_account_impl_class_hash(self: @TContractState, account_class_hash: ClassHash) -> ClassHash;

    /// @notice Get the address of the claim account contract given all parameters
    /// @param class_hash The class hash
    /// @param sender The address of the sender
    /// @param gift_token The ERC-20 token address of the gift
    /// @param gift_amount The amount of the gift
    /// @param fee_token The ERC-20 token address of the fee
    /// @param fee_amount The amount of the fee
    /// @param claim_pubkey The public key associated with the gift
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
}


#[starknet::interface]
pub trait IGiftAccount<TContractState> {
    /// @notice delegates an action to the account implementation
    fn action(ref self: TContractState, selector: felt252, calldata: Array<felt252>) -> Span<felt252>;
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


// TODO Align => Rename ClaimData to Claim OR  claim to claim_data 
// Or even rename to GIFT? so that the user will see gifts in the interface
/// @notice Struct representing the data required for a gift claim
/// @param factory The address of the factory
/// @param class_hash The class hash of the gift account
/// @param sender The address of the sender
/// @param gift_token The ERC-20 token address of the gift
/// @param gift_amount The amount of the gift
/// @param fee_token The ERC-20 token address of the fee
/// @param fee_amount The amount of the fee
/// @param claim_pubkey The public key associated with the gift
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

/// @notice Struct representing the arguments required for constructing a gift account
/// @dev This will be used to determine the address of the gift account
/// @param sender The address of the sender
/// @param gift_token The ERC-20 token address of the gift
/// @param gift_amount The amount of the gift
/// @param fee_token The ERC-20 token address of the fee
/// @param fee_amount The amount of the fee
/// @param claim_pubkey The public key associated with the gift
#[derive(Serde, Drop, Copy)]
pub struct AccountConstructorArguments {
    pub sender: ContractAddress,
    pub gift_token: ContractAddress,
    pub gift_amount: u256,
    pub fee_token: ContractAddress,
    pub fee_amount: u128,
    pub claim_pubkey: felt252
}
