use starknet::{ContractAddress, ClassHash};


/// @notice Struct representing the data required for a claiming a gift
/// @param factory The address of the factory
/// @param escrow_class_hash The class hash of the escrow account
/// @param sender The address of the sender
/// @param gift_token The ERC-20 token address of the gift
/// @param gift_amount The amount of the gift
/// @param fee_token The ERC-20 token address of the fee
/// @param fee_amount The amount of the fee
/// @param gift_pubkey The public key associated with the gift
#[derive(Serde, Drop, Copy)]
pub struct GiftData {
    pub factory: ContractAddress,
    pub escrow_class_hash: ClassHash,
    pub sender: ContractAddress,
    pub gift_token: ContractAddress,
    pub gift_amount: u256,
    pub fee_token: ContractAddress,
    pub fee_amount: u128,
    pub gift_pubkey: felt252
}
