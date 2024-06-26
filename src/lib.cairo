pub mod contracts {
    pub mod claim_hash;
    pub mod escrow_account;
    pub mod escrow_account_library;
    pub mod gift_data;
    pub mod gift_factory;
    pub mod outside_execution;
    pub mod timelock_upgrade;
    pub mod utils;
}

mod mocks {
    mod broken_erc20;
    mod erc20;
    mod reentrant_erc20;
}
