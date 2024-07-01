use argent_gifting::contracts::gift_factory::{IGiftFactory, IGiftFactoryDispatcher, IGiftFactoryDispatcherTrait};

use argent_gifting::contracts::utils::{STRK_ADDRESS, ETH_ADDRESS};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;

use snforge_std::{declare, ContractClassTrait, ContractClass, start_cheat_caller_address, stop_cheat_caller_address};
use starknet::{ClassHash, ContractAddress};

use super::constants::{OWNER, DEPOSITOR, CLAIMER};

const ERC20_SUPPLY: u256 = 1_000_000_000_000_000_000;

pub struct GiftingSetup {
    pub mock_eth: IERC20Dispatcher,
    pub mock_strk: IERC20Dispatcher,
    pub gift_factory: IGiftFactoryDispatcher,
    pub escrow_class_hash: ClassHash,
}

// This will return a valid ETH but a broken STRK at their respective addresses
pub fn deploy_gifting_broken_erc20() -> GiftingSetup {
    let mock_erc20 = declare("MockERC20").expect('Failed to declare ERC20');

    // mock ETH contract
    let mock_eth = deploy_erc20_at(mock_erc20, "ETHER", "ETH", ETH_ADDRESS());

    let broken_erc20 = deploy_broken_erc20_at(STRK_ADDRESS());

    // escrow contract
    let escrow_contract = declare("EscrowAccount").expect('Failed to declare escrow');

    // escrow lib contract
    let escrow_lib_contract = declare("EscrowLibrary").expect('Failed to declare escrow lib');

    // gift factory
    let factory_contract = declare("GiftFactory").expect('Failed to declare factory');
    let mut factory_calldata: Array<felt252> = array![
        escrow_contract.class_hash.try_into().unwrap(),
        escrow_lib_contract.class_hash.try_into().unwrap(),
        OWNER().try_into().unwrap()
    ];
    let (factory_contract_address, _) = factory_contract.deploy(@factory_calldata).expect('Failed to deploy factory');
    let gift_factory = IGiftFactoryDispatcher { contract_address: factory_contract_address };
    assert(gift_factory.get_latest_escrow_class_hash() == escrow_contract.class_hash, 'Incorrect factory setup');

    // Approving eth transfers
    start_cheat_caller_address(mock_eth.contract_address, OWNER());
    mock_eth.transfer(DEPOSITOR(), 1000);
    start_cheat_caller_address(mock_eth.contract_address, DEPOSITOR());
    mock_eth.approve(factory_contract_address, 1000);
    stop_cheat_caller_address(mock_eth.contract_address);

    GiftingSetup { mock_eth, mock_strk: broken_erc20, gift_factory, escrow_class_hash: escrow_contract.class_hash }
}

pub fn deploy_broken_erc20_at(at: ContractAddress) -> IERC20Dispatcher {
    let broken_erc20 = declare("BrokenERC20").expect('Failed to declare broken ERC20');
    let mut broken_erc20_calldata: Array<felt252> = array![];
    let (broken_erc20_address, _) = broken_erc20
        .deploy_at(@broken_erc20_calldata, at)
        .expect('Failed to deploy broken ERC20');
    IERC20Dispatcher { contract_address: broken_erc20_address }
}


pub fn deploy_erc20_at(
    mock_erc20: ContractClass, name: ByteArray, symbol: ByteArray, at: ContractAddress
) -> IERC20Dispatcher {
    // mock ETH contract
    let mut mock_eth_calldata: Array<felt252> = array![];

    mock_eth_calldata.append_serde(name);
    mock_eth_calldata.append_serde(symbol);
    mock_eth_calldata.append_serde(ERC20_SUPPLY);
    mock_eth_calldata.append_serde(OWNER());
    mock_eth_calldata.append_serde(OWNER());
    let (mock_eth_address, _) = mock_erc20.deploy_at(@mock_eth_calldata, at).expect('Failed to deploy');
    IERC20Dispatcher { contract_address: mock_eth_address }
}

pub fn deploy_gifting_normal() -> GiftingSetup {
    let mock_erc20 = declare("MockERC20").expect('Failed to declare ERC20');

    // mock ETH contract
    let mock_eth = deploy_erc20_at(mock_erc20, "ETHER", "ETH", ETH_ADDRESS());
    assert(mock_eth.balance_of(OWNER()) == ERC20_SUPPLY, 'Failed to mint ETH');

    // mock STRK contract
    let mock_strk = deploy_erc20_at(mock_erc20, "STARK", "STRK", STRK_ADDRESS());
    assert(mock_strk.balance_of(OWNER()) == ERC20_SUPPLY, 'Failed to mint STRK');

    // escrow contract
    let escrow_contract = declare("EscrowAccount").expect('Failed to declare escrow');

    // escrow lib contract
    let escrow_lib_contract = declare("EscrowLibrary").expect('Failed to declare escrow lib');

    // gift factory
    let factory_contract = declare("GiftFactory").expect('Failed to declare factory');
    let mut factory_calldata: Array<felt252> = array![
        escrow_contract.class_hash.try_into().unwrap(),
        escrow_lib_contract.class_hash.try_into().unwrap(),
        OWNER().try_into().unwrap()
    ];
    let (factory_contract_address, _) = factory_contract.deploy(@factory_calldata).expect('Failed to deploy factory');
    let gift_factory = IGiftFactoryDispatcher { contract_address: factory_contract_address };
    assert(gift_factory.get_latest_escrow_class_hash() == escrow_contract.class_hash, 'Incorrect factory setup');

    start_cheat_caller_address(mock_eth.contract_address, OWNER());
    start_cheat_caller_address(mock_strk.contract_address, OWNER());
    mock_eth.transfer(DEPOSITOR(), 1000);
    mock_strk.transfer(DEPOSITOR(), 1000);
    start_cheat_caller_address(mock_eth.contract_address, DEPOSITOR());
    start_cheat_caller_address(mock_strk.contract_address, DEPOSITOR());
    mock_eth.approve(factory_contract_address, 1000);
    mock_strk.approve(factory_contract_address, 1000);
    stop_cheat_caller_address(mock_eth.contract_address);
    stop_cheat_caller_address(mock_strk.contract_address);

    assert(mock_eth.balance_of(DEPOSITOR()) == 1000, 'Failed to transfer ETH');
    assert(mock_strk.balance_of(DEPOSITOR()) == 1000, 'Failed to transfer STRK');
    assert(mock_eth.allowance(DEPOSITOR(), factory_contract_address) == 1000, 'Failed to approve ETH');
    assert(mock_strk.allowance(DEPOSITOR(), factory_contract_address) == 1000, 'Failed to approve STRK');

    GiftingSetup { mock_eth, mock_strk, gift_factory, escrow_class_hash: escrow_contract.class_hash }
}
