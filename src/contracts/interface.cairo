use starknet::{ContractAddress, ClassHash, account::Call};

#[starknet::interface]
pub trait IAccount<TContractState> {
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(self: @TContractState, hash: felt252, signature: Array<felt252>) -> felt252;
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

    /// @notice Allows a claim account contract to claim the gift
    /// @dev Can only be called by the claim account contract corresponding to the claim
    /// @param claim The claim data
    /// @param receiver The address of the receiver
    fn claim_internal(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);

    /// @notice Allows a contract to claim the gift given a valid SNIP-12 signature
    /// @dev Will claim the balance of the gift. The fee will be left if it is a different token than the gift
    /// @param claim The claim data
    /// @param receiver The address of the receiver
    /// @param dust_receiver The address of the person that should receive the dust (leftovers)
    /// @param signature The signature of the claimer of the ClaimExternal { receiver }
    fn claim_external(
        ref self: TContractState,
        claim: ClaimData,
        receiver: ContractAddress,
        dust_receiver: ContractAddress,
        signature: Array<felt252>
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

    /// @notice Retrieve the current class_hash used for creating a gift account
    fn get_latest_claim_class_hash(self: @TContractState) -> ClassHash;

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

    /// @notice Get the status of a claim
    /// @param claim The claim data 
    fn get_gift_status(self: @TContractState, claim: ClaimData) -> GiftStatus;
}


#[starknet::interface]
pub trait IGiftAccount<TContractState> {
    /// @notice Allows the factory to perform an array of calls on the account
    /// @dev Can only be called by the factory
    /// @param claim The claim data
    /// @param calls The array of calls to be executed by the account
    fn execute_factory_calls(ref self: TContractState, claim: ClaimData, calls: Array<Call>) -> Array<Span<felt252>>;
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

/// @notice Enum representing the status of a gift
/// @dev ReadyExternalOnly should only happen if there is no fee_amount or if the account reverted during claim_internal
#[derive(Serde, Drop, Copy)]
pub enum GiftStatus {
    ClaimedOrCancelled,
    Ready,
    ReadyExternalOnly
}
