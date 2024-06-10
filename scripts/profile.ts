import { Account, RPC, num, uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, manager } from "../lib";
import { newProfiler } from "../lib/gas";

// TODO add this in CI, skipped atm to avoid false failing tests
// TODO Add possibility to "mix" gift_token and fee_token

const profiler = newProfiler(manager);

await manager.restart();
manager.clearClassCache();

const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
const factory = await manager.deployContract("GiftFactory", {
  unique: true,
  constructorCalldata: [claimAccountClassHash, deployer.address],
});

for (const useTxV3 of [false, true]) {
  const signer = new LegacyStarknetKeyPair(12n);
  const claimPubkey = signer.publicKey;
  const amount = 1000000000000000n;
  const maxFee = 50000000000000n;
  const receiver = "0x42";

    // Make a gift
    const tokenContract = await manager.tokens.feeTokenContract(useTxV3);
    await profiler.profile(
      `Deposit (txV3: ${useTxV3})`,
      await deployer.execute([
        tokenContract.populateTransaction.approve(factory.address, amount + maxFee),
        factory.populateTransaction.deposit(tokenContract.address, amount, tokenContract.address, maxFee, claimPubkey),
      ]),
    );

  // Ensure there is a contract for the claim
  const claimAddress = await factory.get_claim_address(
    claimAccountClassHash,
    deployer.address,
    tokenContract.address,
    amount,
    tokenContract.address,
    maxFee,
    claimPubkey,
  );

  const claim = {
    factory: factory.address,
    class_hash: claimAccountClassHash,
    sender: deployer.address,
    gift_token: tokenContract.address,
    gift_amount: uint256.bnToUint256(amount),
    fee_token: tokenContract.address,
    fee_amount: maxFee,
    claim_pubkey: claimPubkey,
  };

  const txVersion = useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  const claimAccount = new Account(manager, num.toHex(claimAddress), signer, undefined, txVersion);
  factory.connect(claimAccount);
  await profiler.profile(`Claim (txV3: ${useTxV3})`, await factory.claim_internal(claim, receiver));
}

profiler.printSummary();
profiler.updateOrCheckReport();
