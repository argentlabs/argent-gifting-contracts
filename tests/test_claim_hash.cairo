use core::poseidon::hades_permutation;
use snforge_std::cheat_chain_id_global;
use starknet::get_tx_info;
use starknet_gifting::contracts::claim_hash::{
    IStructHashRev1, StarknetDomain, MAINNET_FIRST_HADES_PERMUTATION, SEPOLIA_FIRST_HADES_PERMUTATION
};


fn get_domain_hash() -> felt252 {
    let domain = StarknetDomain {
        name: 'GiftAccount.claim_external', version: '1', chain_id: get_tx_info().unbox().chain_id, revision: 1,
    };
    domain.get_struct_hash_rev_1()
}

#[test]
fn precalculated_hash_sepolia() {
    cheat_chain_id_global('SN_SEPOLIA');
    let domain_hash = get_domain_hash();

    assert_eq!(
        domain_hash,
        3089891524171017171252056067537035313619375025444953524224631832598161345861,
        "Precalculated domain hash is incorrect"
    );
    let (ch0, ch1, ch2) = hades_permutation('StarkNet Message', domain_hash, 0);
    let (pch0, pch1, pch2) = SEPOLIA_FIRST_HADES_PERMUTATION;
    assert_eq!(ch0, pch0, "pch0 incorrect");
    assert_eq!(ch1, pch1, "pch1 incorrect");
    assert_eq!(ch2, pch2, "pch2 incorrect");
}

#[test]
fn precalculated_hash_mainnet() {
    cheat_chain_id_global('SN_MAIN');
    let domain_hash = get_domain_hash();

    assert_eq!(
        domain_hash,
        2359399896352899451220170504813339515847665113764356141486469080669996868811,
        "Precalculated domain hash is incorrect"
    );
    let (ch0, ch1, ch2) = hades_permutation('StarkNet Message', domain_hash, 0);
    let (pch0, pch1, pch2) = MAINNET_FIRST_HADES_PERMUTATION;
    assert_eq!(ch0, pch0, "pch0 incorrect");
    assert_eq!(ch1, pch1, "pch1 incorrect");
    assert_eq!(ch2, pch2, "pch2 incorrect");
}
