use core::hash::HashStateTrait;
use core::poseidon::{poseidon_hash_span, hades_permutation, HashState};
use starknet::{ContractAddress, get_tx_info, get_contract_address};
use starknet_gifting::contracts::interface::ClaimData;

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
        2290778003498892532647895113424078554606348973991615062825644447802575513215,
        182750047543456757364373262546351929621417304867291035081998803081302319089,
        2543701324220169323066790757880739651679085625244174629137263609670383309765
    );

pub const SEPOLIA_FIRST_HADES_PERMUTATION: (felt252, felt252, felt252) =
    (
        1615486825768644260887647864262527069984926815890552675450220847241076576684,
        1358401953861570457998344437013040297914500357949934623895434000436366991786,
        2647731199187769943768342659827172736625478931155879403709851490446461141044
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

        let domain = StarknetDomain { name: 'GiftAccount.claim_external', version: '1', chain_id, revision: 1 };
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
