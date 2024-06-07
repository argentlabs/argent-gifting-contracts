use starknet::{ContractAddress, ClassHash, account::Call};

#[starknet::interface]
pub trait IAccount<TContractState> {
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(self: @TContractState, hash: felt252, signature: Array<felt252>) -> felt252;
}

#[starknet::interface]
pub trait IGiftFactory<TContractState> {
    fn deposit(
        ref self: TContractState,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    );
    fn claim_internal(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);
    fn claim_external(ref self: TContractState, claim: ClaimData, receiver: ContractAddress, signature: Array<felt252>);
    fn cancel(ref self: TContractState, claim: ClaimData);
    fn get_dust(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);

    fn get_latest_claim_class_hash(self: @TContractState) -> ClassHash;
    fn get_claim_address(
        self: @TContractState,
        class_hash: ClassHash,
        sender: ContractAddress,
        gift_token: ContractAddress,
        gift_amount: u256,
        fee_token: ContractAddress,
        fee_amount: u128,
        claim_pubkey: felt252
    ) -> ContractAddress;
}

#[starknet::interface]
pub trait ITimelockUpgrade<TContractState> {
    fn propose_upgrade(ref self: TContractState, new_implementation: ClassHash);
    fn cancel_upgrade(ref self: TContractState);
    fn upgrade(ref self: TContractState, calldata: Array<felt252>);

    fn get_proposed_implementation(self: @TContractState) -> ClassHash;
    fn get_upgrade_ready_at(self: @TContractState) -> u64;
}

#[starknet::interface]
pub trait ITimelockUpgradeCallback<TContractState> {
    fn perform_upgrade(ref self: TContractState, new_implementation: ClassHash, data: Span<felt252>);
}

// TODO Align => Rename ClaimData to Claim OR  claim to claim_data 
// Or even rename to GIFT? so that the user will see gifts in the interface
#[starknet::interface]
pub trait IGiftAccount<TContractState> {
    fn execute_factory_calls(ref self: TContractState, claim: ClaimData, calls: Array<Call>) -> Array<Span<felt252>>;
}

#[derive(Serde, Drop, Copy)]
pub struct ClaimData {
    pub factory: ContractAddress,
    pub class_hash: ClassHash,
    pub sender: ContractAddress,
    pub gift_token: ContractAddress,
    pub gift_amount: u256,
    pub fee_token: ContractAddress,
    pub fee_amount: u128,
    pub claim_pubkey: felt252
}

#[derive(Serde, Drop, Copy)]
pub struct AccountConstructorArguments {
    pub sender: ContractAddress,
    pub gift_token: ContractAddress,
    pub gift_amount: u256,
    pub fee_token: ContractAddress,
    pub fee_amount: u128,
    pub claim_pubkey: felt252
}
