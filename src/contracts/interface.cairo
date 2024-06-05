use starknet::{ContractAddress, ClassHash, account::Call};

#[starknet::interface]
trait IAccount<TContractState> {
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(self: @TContractState, hash: felt252, signature: Array<felt252>) -> felt252;
}

#[starknet::interface]
trait IGiftFactory<TContractState> {
    fn deposit(ref self: TContractState, amount: u256, max_fee: u128, token: ContractAddress, claim_pubkey: felt252);
    fn get_claim_address(
        self: @TContractState,
        sender: ContractAddress,
        amount: u256,
        max_fee: u128,
        token: ContractAddress,
        claim_pubkey: felt252
    ) -> ContractAddress;
    fn get_claim_class_hash(ref self: TContractState) -> ClassHash;

    fn claim_internal(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);

    fn claim_external(ref self: TContractState, claim: ClaimData, receiver: ContractAddress, signature: Array<felt252>);

    fn cancel(ref self: TContractState, claim: ClaimData);

    fn get_dust(ref self: TContractState, claim: ClaimData, receiver: ContractAddress);
}

// TODO Align => Rename ClaimData to Claim OR  claim to claim_data 
// Or even rename to GIFT? so that the user will see gifts in the interface
#[starknet::interface]
trait IGiftAccount<TContractState> {
    fn execute_factory_calls(ref self: TContractState, claim: ClaimData, calls: Array<Call>) -> Array<Span<felt252>>;
}

#[derive(Serde, Drop, Copy)]
struct ClaimData {
    factory: ContractAddress,
    class_hash: ClassHash,
    sender: ContractAddress,
    amount: u256,
    max_fee: u128,
    token: ContractAddress,
    claim_pubkey: felt252
}

#[derive(Serde, Drop, Copy)]
struct AccountConstructorArguments {
    sender: ContractAddress,
    amount: u256,
    max_fee: u128,
    token: ContractAddress,
    claim_pubkey: felt252
}
