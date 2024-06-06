// TODO Just temp atm, plz split this file
use core::hash::{HashStateTrait, HashStateExTrait, Hash};
use core::poseidon::{PoseidonTrait, HashState};
use openzeppelin::token::erc20::interface::IERC20Dispatcher;
use starknet::{
    ContractAddress, account::Call, contract_address::contract_address_const, info::v2::ResourceBounds,
    call_contract_syscall
};

pub const TX_V1: felt252 = 1; // INVOKE
pub const TX_V1_ESTIMATE: felt252 = consteval_int!(0x100000000000000000000000000000000 + 1); // 2**128 + TX_V1
pub const TX_V3: felt252 = 3;
pub const TX_V3_ESTIMATE: felt252 = consteval_int!(0x100000000000000000000000000000000 + 3); // 2**128 + TX_V3

pub fn STRK_ADDRESS() -> ContractAddress {
    contract_address_const::<0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d>()
}

pub fn ETH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7>()
}

// Tries to deserialize the given data into.
// The data must only contain the returned value and nothing else
fn full_deserialize<E, impl ESerde: Serde<E>, impl EDrop: Drop<E>>(mut data: Span<felt252>) -> Option<E> {
    let parsed_value: E = ESerde::deserialize(ref data)?;
    if data.is_empty() {
        Option::Some(parsed_value)
    } else {
        Option::None
    }
}

fn serialize<E, impl ESerde: Serde<E>>(value: @E) -> Array<felt252> {
    let mut output = array![];
    ESerde::serialize(value, ref output);
    output
}

fn execute_multicall(mut calls: Span<Call>) -> Array<Span<felt252>> {
    let mut result = array![];
    let mut index = 0;
    while let Option::Some(call) = calls
        .pop_front() {
            match call_contract_syscall(*call.to, *call.selector, *call.calldata) {
                Result::Ok(retdata) => {
                    result.append(retdata);
                    index += 1;
                },
                Result::Err(revert_reason) => {
                    let mut data = array!['argent/multicall-failed', index];
                    data.append_all(revert_reason.span());
                    panic(data);
                },
            }
        };
    result
}

#[generate_trait]
impl ArrayExt<T, +Drop<T>, +Copy<T>> of ArrayExtTrait<T> {
    fn append_all(ref self: Array<T>, mut value: Span<T>) {
        while let Option::Some(item) = value.pop_front() {
            self.append(*item);
        };
    }
}
