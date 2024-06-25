use openzeppelin::utils::deployments::calculate_contract_address_from_deploy_syscall;
use starknet::{
    ContractAddress, account::Call, contract_address::contract_address_const, syscalls::call_contract_syscall
};
use starknet_gifting::contracts::interface::{ClaimData, AccountConstructorArguments};

pub const TX_V1: felt252 = 1; // INVOKE
pub const TX_V1_ESTIMATE: felt252 = consteval_int!(0x100000000000000000000000000000000 + 1); // 2**128 + TX_V1
pub const TX_V3: felt252 = 3;
pub const TX_V3_ESTIMATE: felt252 = consteval_int!(0x100000000000000000000000000000000 + 3); // 2**128 + TX_V3

pub fn STRK_ADDRESS() -> ContractAddress {
    contract_address_const::<0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d>()
}

pub fn ETH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7>()
}

// Tries to deserialize the given data into.
// The data must only contain the returned value and nothing else
pub fn full_deserialize<E, impl ESerde: Serde<E>, impl EDrop: Drop<E>>(mut data: Span<felt252>) -> Option<E> {
    let parsed_value: E = ESerde::deserialize(ref data)?;
    if data.is_empty() {
        Option::Some(parsed_value)
    } else {
        Option::None
    }
}

pub fn serialize<E, impl ESerde: Serde<E>>(value: @E) -> Array<felt252> {
    let mut output = array![];
    ESerde::serialize(value, ref output);
    output
}

/// @notice Computes the ContractAddress of an account for a given claim
/// @dev The salt used is fixed to 0 to ensure there's only one contract for a given claim.
/// @dev The deployer_address is the factory address, as the account contract is deployed by the factory
/// @param claim The claim data for which you need to calculate the account contract address
/// @return The ContractAddress of the account contract corresponding to the claim
pub fn calculate_claim_account_address(claim: ClaimData) -> ContractAddress {
    let constructor_arguments = AccountConstructorArguments {
        sender: claim.sender,
        gift_token: claim.gift_token,
        gift_amount: claim.gift_amount,
        fee_token: claim.fee_token,
        fee_amount: claim.fee_amount,
        claim_pubkey: claim.claim_pubkey
    };
    calculate_contract_address_from_deploy_syscall(
        0, // salt
        claim.class_hash, // class_hash
        serialize(@constructor_arguments).span(), // constructor_data
        claim.factory
    )
}
