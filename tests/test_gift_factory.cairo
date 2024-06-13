use openzeppelin::security::interface::{IPausable, IPausableDispatcher, IPausableDispatcherTrait};
use openzeppelin::token::erc20::interface::{IERC20, IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::deployments::calculate_contract_address_from_deploy_syscall;
use openzeppelin::utils::serde::SerializedAppend;
use snforge_std::{start_cheat_caller_address, stop_cheat_caller_address, get_class_hash};
use starknet_gifting::contracts::claim_utils::calculate_claim_account_address;
use starknet_gifting::contracts::interface::{
    IGiftFactory, IGiftFactoryDispatcher, IGiftFactoryDispatcherTrait, ClaimData
};
use super::constants::{DEPOSITOR, CLAIMER, UNAUTHORIZED_ERC20, CLAIM_PUB_KEY};
use super::setup::{deploy_gifting_normal, deploy_gifting_broken_erc20, GiftingSetup};


#[test]
#[should_panic(expected: ('gift-fac/transfer-failed',))]
fn test_transfer_from_fail() {
    let GiftingSetup { mock_eth, gift_factory, .. } = deploy_gifting_broken_erc20();

    start_cheat_caller_address(gift_factory.contract_address, DEPOSITOR());
    gift_factory.deposit(mock_eth.contract_address, 10, mock_eth.contract_address, 5, CLAIM_PUB_KEY());
}

#[test]
#[should_panic(expected: ('gift-fac/fee-too-high',))]
fn test_deposit_max_fee_same_as_amount() {
    let GiftingSetup { mock_eth, gift_factory, .. } = deploy_gifting_normal();
    start_cheat_caller_address(gift_factory.contract_address, DEPOSITOR());
    gift_factory.deposit(mock_eth.contract_address, 10, mock_eth.contract_address, 10, CLAIM_PUB_KEY());
}

#[test]
#[should_panic(expected: ('gift-fac/fee-too-high',))]
fn test_deposit_max_fee_too_high() {
    let GiftingSetup { mock_eth, gift_factory, .. } = deploy_gifting_normal();
    start_cheat_caller_address(gift_factory.contract_address, DEPOSITOR());
    gift_factory.deposit(mock_eth.contract_address, 10, mock_eth.contract_address, 12, CLAIM_PUB_KEY());
}

#[test]
fn test_claim_account_deployed() {
    let GiftingSetup { mock_eth, gift_factory, claim_class_hash, .. } = deploy_gifting_normal();
    let gift_token = mock_eth.contract_address;
    let gift_amount = 10;
    let fee_token = mock_eth.contract_address;
    let fee_amount = 5;

    let claim_data = ClaimData {
        factory: gift_factory.contract_address,
        class_hash: claim_class_hash,
        sender: DEPOSITOR(),
        gift_token,
        gift_amount,
        fee_token,
        fee_amount,
        claim_pubkey: CLAIM_PUB_KEY(),
    };

    let calculated_claim_address = calculate_claim_account_address(claim_data);

    start_cheat_caller_address(gift_factory.contract_address, DEPOSITOR());
    gift_factory.deposit(gift_token, gift_amount, fee_token, fee_amount, CLAIM_PUB_KEY());

    // Check that the claim account was deployed by getting class hash at that address 
    // un-deployed claim account should return 0
    let fetched_claim_class_hash = get_class_hash(calculated_claim_address);
    assert(claim_class_hash == fetched_claim_class_hash, 'Claim account not deployed');
    assert(claim_class_hash == gift_factory.get_latest_claim_class_hash(), 'Incorrect claim class hash');

    // Check that factory calculates claim address correctly
    let get_claim_address = gift_factory
        .get_claim_address(
            claim_data.class_hash,
            claim_data.sender,
            claim_data.gift_token,
            claim_data.gift_amount,
            claim_data.fee_token,
            claim_data.fee_amount,
            claim_data.claim_pubkey
        );
    assert!(calculated_claim_address == get_claim_address, "Claim address not calculated correctly");
}

#[test]
#[should_panic(expected: ('Caller is not the owner',))]
fn test_get_dust_only_owner() {
    let GiftingSetup { mock_eth, gift_factory, claim_class_hash, .. } = deploy_gifting_normal();
    let gift_token = mock_eth.contract_address;
    let gift_amount = 10;
    let fee_token = mock_eth.contract_address;
    let fee_amount = 5;

    start_cheat_caller_address(gift_factory.contract_address, DEPOSITOR());
    gift_factory.deposit(gift_token, 10, fee_token, 5, CLAIM_PUB_KEY());

    let claim_data = ClaimData {
        factory: gift_factory.contract_address,
        class_hash: claim_class_hash,
        sender: DEPOSITOR(),
        gift_token,
        gift_amount,
        fee_token,
        fee_amount,
        claim_pubkey: CLAIM_PUB_KEY(),
    };
    gift_factory.get_dust(claim_data, CLAIMER());
}

