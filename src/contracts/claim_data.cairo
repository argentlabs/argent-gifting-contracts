use starknet::{ContractAddress, ClassHash};

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
