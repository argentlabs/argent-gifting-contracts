use starknet::{ContractAddress, ClassHash, account::Call};

#[starknet::interface]
pub trait IAccount<TContractState> {
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(self: @TContractState, hash: felt252, signature: Array<felt252>) -> felt252;
}

#[starknet::interface]
pub trait IGiftFactory<TContractState> {
    /// @notice Create a new claim
    /// @dev TODO Anything dev?
    /// @param gift_token The ERC-20 token address of the gift
    /// @param gift_amount The amount of the gift
    /// @param fee_token The ERC-20 token address of the fee (can ONLY be ETH or STARK address)
    /// @param fee_amount The amount of the fee
    /// @param claim_pubkey The public key of the claimer
    fn deposit(
        ref self: TContractState,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    );

    /// @notice Allows a claim account contract to claim the gift
    /// @param claim The claim data
    /// @param receiver The address of the receiver
    fn claim_internal(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);

    /// @notice Allows a contract to claim the gift given a valid SNIP-12 signature
    /// @dev Will claim the balance of the gift. The fee will be left if it is a different token
    /// @param claim The claim data
    /// @param receiver The address of the receiver
    /// @param signature The signature of the claimer of the ClaimExternal { receiver }
    fn claim_external(ref self: TContractState, claim: ClaimData, receiver: ContractAddress, signature: Array<felt252>);

    /// @notice Allows the sender of a gift to cancel their gift
    /// @dev Will refund both the gift and the fee
    /// @param claim The claim data of the gift to cancel
    fn cancel(ref self: TContractState, claim: ClaimData);

    /// @notice Allows the owner of the factory to claim the dust (leftovers) of a claim
    /// @dev Only allowed if the gift has been claimed
    /// @param claim The claim data of the claimed gift 
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
    /// @param claim_pubkey The public key of the claimer
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
pub trait ITimelockUpgrade<TContractState> {
    /// @notice Propose a new implementation for the contract to upgrade to
    /// @dev There is a 7 day window to be able to perform the upgrade then the upgrade can be performed for a window of 7 days
    /// @dev If there is an ongoing upgrade the previous proposition will be overwritten
    /// @param new_implementation The class hash of the new implementation
    fn propose_upgrade(ref self: TContractState, new_implementation: ClassHash);

    /// @notice Cancel the upgrade proposition
    /// @dev Will fail if there is no ongoing upgrade
    fn cancel_upgrade(ref self: TContractState);

    /// @notice Perform the upgrade to the proposed implementation
    /// @dev There is a 7 day window to be able to perform the upgrade then the upgrade can be performed for a window of 7 days
    /// @param calldata The calldata to be used for the upgrade by perform_upgrade()
    fn upgrade(ref self: TContractState, calldata: Array<felt252>);

    /// @notice Gets the proposed implementation
    fn get_proposed_implementation(self: @TContractState) -> ClassHash;

    /// @notice Gets the upgrade ready at timestamp
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
