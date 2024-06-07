use openzeppelin::utils::deployments::calculate_contract_address_from_deploy_syscall;
use starknet::ContractAddress;
use starknet_gifting::contracts::interface::{ClaimData, AccountConstructorArguments};
use starknet_gifting::contracts::utils::serialize;

pub fn calculate_claim_account_address(claim: ClaimData) -> ContractAddress {
    let constructor_arguments = AccountConstructorArguments {
        sender: claim.sender,
        amount: claim.amount,
        max_fee: claim.max_fee,
        token: claim.token,
        claim_pubkey: claim.claim_pubkey
    };
    return calculate_contract_address_from_deploy_syscall(
        0, // salt
        claim.class_hash, // class_hash
        serialize(@constructor_arguments).span(), // constructor_data
        claim.factory
    );
}
