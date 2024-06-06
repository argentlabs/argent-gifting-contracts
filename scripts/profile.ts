import { Account, RPC, num, uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, manager } from "../lib";
import { newProfiler } from "../lib/gas";

// TODO add this in CI, skipped atm to avoid false failing tests

const profiler = newProfiler(manager);

await manager.restart();
manager.clearClassCache();

const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
const factory = await manager.deployContract("GiftFactory", {
  unique: true,
  constructorCalldata: [claimAccountClassHash, deployer.address],
});

for (const useTxV3 of [false, true]) {
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
  await profiler.profile(
    `Deposit (txV3: ${useTxV3})`,
    await factory.deposit(amount, maxFee, tokenContract.address, claimPubkey),
  );

  // Ensure there is a contract for the claim
  const claimAddress = await factory.get_claim_address(
    claimAccountClassHash,
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

  const txVersion = useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  const claimAccount = new Account(manager, num.toHex(claimAddress), signer, undefined, txVersion);
  factory.connect(claimAccount);
  await profiler.profile(`Claim (txV3: ${useTxV3})`, await factory.claim_internal(claim, receiver));
}

profiler.printSummary();
profiler.updateOrCheckReport();
