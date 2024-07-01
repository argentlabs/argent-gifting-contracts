use argent_gifting::contracts::claim_hash::{
    IStructHashRev1, StarknetDomain, MAINNET_FIRST_HADES_PERMUTATION, SEPOLIA_FIRST_HADES_PERMUTATION
};
use argent_gifting::contracts::gift_factory::{IGiftFactory, IGiftFactoryDispatcherTrait};
use core::poseidon::hades_permutation;
use openzeppelin::token::erc20::interface::{IERC20, IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{cheat_caller_address_global, cheat_chain_id_global};
use starknet::get_tx_info;
use super::constants::DEPOSITOR;
use super::setup::{deploy_gifting_broken_erc20, GiftingSetup, deploy_gifting_normal};

#[test]
#[should_panic(expected: ('gift-fac/transfer-failed',))]
fn test_deposit_same_token_failing_transfer() {
    let GiftingSetup { .., mock_eth, gift_factory, escrow_class_hash } = deploy_gifting_broken_erc20();
    gift_factory.deposit(escrow_class_hash, mock_eth.contract_address, 101, mock_eth.contract_address, 100, 12);
}


#[test]
fn test_a() {
    let GiftingSetup { mock_strk, mock_eth, gift_factory, escrow_class_hash } = deploy_gifting_normal();
    cheat_caller_address_global(DEPOSITOR());
    assert(mock_eth.allowance(DEPOSITOR(), gift_factory.contract_address) == 1000, 'Failed to approve ETH');
    assert(mock_strk.allowance(DEPOSITOR(), gift_factory.contract_address) == 1000, 'Failed to approve ETH');
    gift_factory.deposit(escrow_class_hash, mock_eth.contract_address, 100, mock_strk.contract_address, 100, 42);
}
