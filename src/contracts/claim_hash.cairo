use core::hash::HashStateTrait;
use core::poseidon::{poseidon_hash_span, hades_permutation, HashState};
use starknet::{ContractAddress, get_tx_info};

/// @notice Defines the function to generate the SNIP-12 revision 1 compliant message hash
pub trait IOffChainMessageHashRev1<T> {
    fn get_message_hash_rev_1(self: @T, account: ContractAddress) -> felt252;
}

/// @notice Defines the function to generates the SNIP-12 revision 1 compliant hash on an object
pub trait IStructHashRev1<T> {
    fn get_struct_hash_rev_1(self: @T) -> felt252;
}

/// @notice StarkNetDomain using SNIP 12 Revision 1
#[derive(Drop, Copy)]
pub struct StarknetDomain {
    pub name: felt252,
    pub version: felt252,
    pub chain_id: felt252,
    pub revision: felt252,
}

/// @notice The SNIP-12 message that needs to be signed when using claim_external
/// @param receiver The receiver of the gift
#[derive(Drop, Copy)]
pub struct ClaimExternal {
    pub receiver: ContractAddress,
    pub dust_receiver: ContractAddress,
}

const STARKNET_DOMAIN_TYPE_HASH_REV_1: felt252 =
    selector!(
        "\"StarknetDomain\"(\"name\":\"shortstring\",\"version\":\"shortstring\",\"chainId\":\"shortstring\",\"revision\":\"shortstring\")"
    );

const CLAIM_EXTERNAL_TYPE_HASH_REV_1: felt252 =
    selector!("\"ClaimExternal\"(\"receiver\":\"ContractAddress\",\"dust receiver\":\"ContractAddress\")");

impl StructHashStarknetDomain of IStructHashRev1<StarknetDomain> {
    fn get_struct_hash_rev_1(self: @StarknetDomain) -> felt252 {
        poseidon_hash_span(
            array![STARKNET_DOMAIN_TYPE_HASH_REV_1, *self.name, *self.version, *self.chain_id, *self.revision].span()
        )
    }
}

impl StructHashClaimExternal of IStructHashRev1<ClaimExternal> {
    fn get_struct_hash_rev_1(self: @ClaimExternal) -> felt252 {
        poseidon_hash_span(
            array![
                CLAIM_EXTERNAL_TYPE_HASH_REV_1,
                (*self).receiver.try_into().expect('receiver'),
                (*self).dust_receiver.try_into().expect('dust receiver')
            ]
                .span()
        )
    }
}

pub const MAINNET_FIRST_HADES_PERMUTATION: (felt252, felt252, felt252) =
    (
        51327417978415965208169103467166821837258659346127673007877596566411752209,
        404713855488389632083006643023042313437307371031291768022239836903948396963,
        389369424440010405916079789663583430968252485429471935476783216782654849452
    );

pub const SEPOLIA_FIRST_HADES_PERMUTATION: (felt252, felt252, felt252) =
    (
        3490629689183768224029659172482831330773656358583155290029264631185823046188,
        2282067178720039168203625096855019793380766562534282834247329930463326923381,
        3105849593939290506670850151949399226662980212920556211540197981933140560183
    );


impl ClaimExternalHash of IOffChainMessageHashRev1<ClaimExternal> {
    fn get_message_hash_rev_1(self: @ClaimExternal, account: ContractAddress) -> felt252 {
        let chain_id = get_tx_info().unbox().chain_id;
        if chain_id == 'SN_MAIN' {
            return get_message_hash_rev_1_with_precalc(MAINNET_FIRST_HADES_PERMUTATION, account, *self);
        }

        if chain_id == 'SN_SEPOLIA' {
            return get_message_hash_rev_1_with_precalc(SEPOLIA_FIRST_HADES_PERMUTATION, account, *self);
        }

        let domain = StarknetDomain { name: 'GiftFactory.claim_external', version: '1', chain_id, revision: 1 };
        poseidon_hash_span(
            array!['StarkNet Message', domain.get_struct_hash_rev_1(), account.into(), self.get_struct_hash_rev_1()]
                .span()
        )
    }
}

pub fn get_message_hash_rev_1_with_precalc<T, +Drop<T>, +IStructHashRev1<T>>(
    hades_permutation_state: (felt252, felt252, felt252), account: ContractAddress, rev1_struct: T
) -> felt252 {
    // mainnet_domain_hash = domain.get_struct_hash_rev_1()
    // hades_permutation_state == hades_permutation('StarkNet Message', mainnet_domain_hash, 0);
    let (s0, s1, s2) = hades_permutation_state;

    let (fs0, fs1, fs2) = hades_permutation(s0 + account.into(), s1 + rev1_struct.get_struct_hash_rev_1(), s2);
    HashState { s0: fs0, s1: fs1, s2: fs2, odd: false }.finalize()
}
