pub mod contracts {
    mod claim_account;
    pub mod claim_hash;
    pub mod claim_utils;
    mod gift_factory;
    pub mod interface;
    mod timelock_upgrade;
    pub mod utils;
}

mod mocks {
    mod broken_erc20;
    mod reentrant_erc20;
    mod erc20;
}
