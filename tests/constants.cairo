use snforge_std::signature::{
    KeyPair, KeyPairTrait, stark_curve::{StarkCurveKeyPairImpl, StarkCurveSignerImpl, StarkCurveVerifierImpl},
};
use starknet::ContractAddress;

fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

fn DEPOSITOR() -> ContractAddress {
    'DEPOSITOR'.try_into().unwrap()
}

fn CLAIMER() -> ContractAddress {
    'CLAIMER'.try_into().unwrap()
}

fn CLAIM_PUB_KEY() -> felt252 {
    let new_owner = KeyPairTrait::from_secret_key('CLAIM');
    new_owner.public_key
}

fn UNAUTHORIZED_ERC20() -> ContractAddress {
    'UNAUTHORIZED ERC20'.try_into().unwrap()
}
