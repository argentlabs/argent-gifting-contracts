import { Account, RPC, num } from "starknet";
import { Claim, LegacyStarknetKeyPair, calculateClaimAddress, deployer, deposit, manager } from "../lib";
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

const ethContract = await manager.tokens.ethContract();
const strkContract = await manager.tokens.strkContract();

const tokens = [
  { giftTokenContract: ethContract, unit: "WEI" as RPC.PriceUnit },
  { giftTokenContract: strkContract, unit: "FRI" as RPC.PriceUnit },
];

for (const { giftTokenContract, unit } of tokens) {
  for (const useTxV3 of [false, true]) {
    const signer = new LegacyStarknetKeyPair(12n);
    const claimPubkey = signer.publicKey;
    const amount = 1000000000000000n;
    const maxFee = 50000000000000n;
    const receiver = "0x42";

    // Mint tokens
    await manager.mint(deployer.address, amount, unit);
    await manager.mint(deployer.address, maxFee, manager.tokens.unitTokenContract(useTxV3));

    // Make a gift
    const feeTokenContract = await manager.tokens.feeTokenContract(useTxV3);
    await profiler.profile(
      `Gifting ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await deposit(
        deployer,
        amount,
        maxFee,
        factory.address,
        feeTokenContract.address,
        giftTokenContract.address,
        claimPubkey,
      ),
    );

    const claim: Claim = {
      factory: factory.address,
      class_hash: claimAccountClassHash,
      sender: deployer.address,
      gift_token: giftTokenContract.address,
      gift_amount: amount,
      fee_token: feeTokenContract.address,
      fee_amount: maxFee,
      claim_pubkey: claimPubkey,
    };

    // Get account claiming address
    const claimAddress = await calculateClaimAddress(claim);

    const txVersion = useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
    const claimAccount = new Account(manager, num.toHex(claimAddress), signer, undefined, txVersion);
    factory.connect(claimAccount);
    await profiler.profile(
      `Claiming ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await factory.claim_internal(claim, receiver),
    );
  }
}

profiler.printSummary();
profiler.updateOrCheckReport();
