use openzeppelin::token::erc20::interface::{IERC20, IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;

use snforge_std::{declare, ContractClassTrait, ContractClass, start_cheat_caller_address, stop_cheat_caller_address};
use starknet::ClassHash;
use starknet_gifting::contracts::gift_factory::{IGiftFactory, IGiftFactoryDispatcher, IGiftFactoryDispatcherTrait};

use starknet_gifting::contracts::utils::{STRK_ADDRESS, ETH_ADDRESS};

use super::constants::{OWNER, DEPOSITOR, CLAIMER};

pub struct GiftingSetup {
    pub mock_eth: IERC20Dispatcher,
    pub mock_strk: IERC20Dispatcher,
    pub gift_factory: IGiftFactoryDispatcher,
    pub claim_class_hash: ClassHash,
}

pub fn deploy_gifting_broken_erc20() -> GiftingSetup {
    let broken_erc20 = declare("BrokenERC20").expect('Failed to declare broken ERC20');
    let mut broken_erc20_calldata: Array<felt252> = array![];
    let (broken_erc20_address, _) = broken_erc20
        .deploy_at(@broken_erc20_calldata, ETH_ADDRESS())
        .expect('Failed to deploy broken ERC20');
    let broken_erc20 = IERC20Dispatcher { contract_address: broken_erc20_address };

    // claim contract
    let claim_contract = declare("ClaimAccount").expect('Failed to declare claim');

    // gift factory
    let factory_contract = declare("GiftFactory").expect('Failed to declare factory');
    let mut factory_calldata: Array<felt252> = array![
        claim_contract.class_hash.try_into().unwrap(), OWNER().try_into().unwrap()
    ];
    let (factory_contract_address, _) = factory_contract.deploy(@factory_calldata).expect('Failed to deploy factory');
    let gift_factory = IGiftFactoryDispatcher { contract_address: factory_contract_address };
    assert(gift_factory.get_latest_claim_class_hash() == claim_contract.class_hash, 'Incorrect factory setup');

    GiftingSetup {
        mock_eth: broken_erc20, mock_strk: broken_erc20, gift_factory, claim_class_hash: claim_contract.class_hash
    }
}

pub fn deploy_gifting_normal() -> GiftingSetup {
    let erc20_supply = 1_000_000_000_000_000_000_u256;

    let mock_erc20 = declare("MockERC20").expect('Failed to declare ERC20');
    // mock ETH contract
    let mut mock_eth_calldata: Array<felt252> = array![];
    let name: ByteArray = "ETHER";
    let symbol: ByteArray = "ETH";
    mock_eth_calldata.append_serde(name);
    mock_eth_calldata.append_serde(symbol);
    mock_eth_calldata.append_serde(erc20_supply);
    mock_eth_calldata.append_serde(OWNER());
    mock_eth_calldata.append_serde(OWNER());
    let (mock_eth_address, _) = mock_erc20.deploy_at(@mock_eth_calldata, ETH_ADDRESS()).expect('Failed to deploy ETH');
    let mock_eth = IERC20Dispatcher { contract_address: mock_eth_address };
    assert(mock_eth.balance_of(OWNER()) == erc20_supply, 'Failed to mint ETH');

    // mock STRK contract
    let mut mock_eth_calldata: Array<felt252> = array![];
    let name: ByteArray = "STARK";
    let symbol: ByteArray = "STRK";
    mock_eth_calldata.append_serde(name);
    mock_eth_calldata.append_serde(symbol);
    mock_eth_calldata.append_serde(erc20_supply);
    mock_eth_calldata.append_serde(OWNER());
    mock_eth_calldata.append_serde(OWNER());
    let (mock_strk_address, _) = mock_erc20
        .deploy_at(@mock_eth_calldata, STRK_ADDRESS())
        .expect('Failed to deploy STRK');
    let mock_strk = IERC20Dispatcher { contract_address: mock_strk_address };
    assert(mock_strk.balance_of(OWNER()) == erc20_supply, 'Failed to mint STRK');

    // claim contract
    let claim_contract = declare("ClaimAccount").expect('Failed to declare claim');

    // gift factory
    let factory_contract = declare("GiftFactory").expect('Failed to declare factory');
    let mut factory_calldata: Array<felt252> = array![
        claim_contract.class_hash.try_into().unwrap(), OWNER().try_into().unwrap()
    ];
    let (factory_contract_address, _) = factory_contract.deploy(@factory_calldata).expect('Failed to deploy factory');
    let gift_factory = IGiftFactoryDispatcher { contract_address: factory_contract_address };
    assert(gift_factory.get_latest_claim_class_hash() == claim_contract.class_hash, 'Incorrect factory setup');

    start_cheat_caller_address(mock_eth_address, OWNER());
    start_cheat_caller_address(mock_strk.contract_address, OWNER());
    mock_eth.transfer(DEPOSITOR(), 1000);
    mock_strk.transfer(DEPOSITOR(), 1000);
    start_cheat_caller_address(mock_eth_address, DEPOSITOR());
    start_cheat_caller_address(mock_strk_address, DEPOSITOR());
    mock_eth.approve(factory_contract_address, 1000);
    mock_strk.approve(factory_contract_address, 1000);
    stop_cheat_caller_address(mock_eth_address);
    stop_cheat_caller_address(mock_strk_address);

    assert(mock_eth.balance_of(DEPOSITOR()) == 1000, 'Failed to transfer ETH');
    assert(mock_strk.balance_of(DEPOSITOR()) == 1000, 'Failed to transfer STRK');
    assert(mock_eth.allowance(DEPOSITOR(), factory_contract_address) == 1000, 'Failed to approve ETH');
    assert(mock_strk.allowance(DEPOSITOR(), factory_contract_address) == 1000, 'Failed to approve STRK');

    GiftingSetup { mock_eth, mock_strk, gift_factory, claim_class_hash: claim_contract.class_hash }
}
