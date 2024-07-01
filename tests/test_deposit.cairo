use argent_gifting::contracts::gift_factory::{IGiftFactoryDispatcherTrait};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{start_cheat_caller_address};
use super::constants::DEPOSITOR;
use super::setup::{GiftingSetup, deploy_gifting_broken_erc20};

#[test]
#[should_panic(expected: ('gift-fac/transfer-failed',))]
fn test_deposit_same_token_failing_transfer() {
    let GiftingSetup { .., mock_strk, gift_factory, escrow_class_hash } = deploy_gifting_broken_erc20();
    gift_factory.deposit(escrow_class_hash, mock_strk.contract_address, 101, mock_strk.contract_address, 100, 12);
}

#[test]
#[should_panic(expected: ('gift-fac/transfer-gift-failed',))]
fn test_deposit_different_token_failing_gift_transfer() {
    let GiftingSetup { mock_eth, mock_strk, gift_factory, escrow_class_hash } = deploy_gifting_broken_erc20();
    let broken_erc20 = mock_strk;
    start_cheat_caller_address(gift_factory.contract_address, DEPOSITOR());
    gift_factory.deposit(escrow_class_hash, broken_erc20.contract_address, 100, mock_eth.contract_address, 100, 42);
}

#[test]
#[should_panic(expected: ('gift-fac/transfer-fee-failed',))]
fn test_deposit_different_token_failing_fee_transfer() {
    let GiftingSetup { mock_eth, mock_strk, gift_factory, escrow_class_hash } = deploy_gifting_broken_erc20();
    let broken_erc20 = mock_strk;
    start_cheat_caller_address(gift_factory.contract_address, DEPOSITOR());
    gift_factory.deposit(escrow_class_hash, mock_eth.contract_address, 100, broken_erc20.contract_address, 100, 42);
}
