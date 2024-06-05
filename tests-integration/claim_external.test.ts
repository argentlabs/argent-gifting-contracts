import { uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, getClaimExternalData, manager } from "../lib";

describe("claim_external", function () {
  const useTxV3 = true;
  it(`Testing claim_external flow using txV3: ${useTxV3}`, async function () {
    await manager.restartDevnetAndClearClassCache();
    // Deploy factory
    const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
    const factory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });
    const signer = new LegacyStarknetKeyPair();
    const claimPubkey = signer.publicKey;
    const amount = 1000000000000000n;
    const maxFee = 50000000000000n;
    const receiver = "0x42";

    // Make a gift
    const tokenContract = await manager.tokens.feeTokenContract(useTxV3);
    tokenContract.connect(deployer);
    factory.connect(deployer);
    await tokenContract.approve(factory.address, amount + maxFee);
    await factory.deposit(amount, maxFee, tokenContract.address, claimPubkey);

    const claimAddress = await factory.get_claim_address(
      deployer.address,
      amount,
      maxFee,
      tokenContract.address,
      claimPubkey,
    );

    const claim = {
      factory: factory.address,
      class_hash: claimAccountClassHash,
      sender: deployer.address,
      amount: uint256.bnToUint256(amount),
      max_fee: maxFee,
      token: tokenContract.address,
      claim_pubkey: claimPubkey,
    };

    const claimExternalData = await getClaimExternalData({ receiver });
    const signature = await signer.signMessage(claimExternalData, claimAddress);

    await factory.claim_external(claim, receiver, signature);
  });
});
