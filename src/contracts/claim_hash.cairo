use core::poseidon::poseidon_hash_span;
use starknet::{ContractAddress, get_tx_info, get_contract_address};
use starknet_gifting::contracts::interface::ClaimData;

/// @notice Defines the function to generate the SNIP-12 revision 1 compliant message hash
pub trait IOffChainMessageHashRev1<T> {
    fn get_message_hash_rev_1(self: @T, account: ContractAddress) -> felt252;
}

/// @notice Defines the function to generates the SNIP-12 revision 1 compliant hash on an object
trait IStructHashRev1<T> {
    fn get_struct_hash_rev_1(self: @T) -> felt252;
}

/// @notice StarkNetDomain using SNIP 12 Revision 1
#[derive(Drop, Copy)]
struct StarknetDomain {
    name: felt252,
    version: felt252,
    chain_id: felt252,
    revision: felt252,
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

impl ClaimExternalHash of IOffChainMessageHashRev1<ClaimExternal> {
    fn get_message_hash_rev_1(self: @ClaimExternal, account: ContractAddress) -> felt252 {
        let chain_id = get_tx_info().unbox().chain_id;
        let domain = StarknetDomain { name: 'GiftAccount.claim_external', version: '1', chain_id, revision: 1 };
        // We could hardcode mainnet && sepolia for better performance
        poseidon_hash_span(
            array!['StarkNet Message', domain.get_struct_hash_rev_1(), account.into(), self.get_struct_hash_rev_1()]
                .span()
        )
    }
}
