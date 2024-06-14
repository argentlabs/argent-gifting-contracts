pub mod contracts {
    mod claim_account;
    mod claim_hash;
    pub mod claim_utils;
    mod gift_factory;
    pub mod interface;
    mod timelock_upgrade;
    pub mod utils;
}

mod mocks {
    mod erc20;
    mod erc20_transfer;
}
