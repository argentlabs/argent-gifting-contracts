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

const ethContract = await manager.tokens.ethContract();
const strkContract = await manager.tokens.strkContract();

const tokens = [
  { giftTokenContract: ethContract, unit: "WEI" },
  { giftTokenContract: strkContract, unit: "FRI" },
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
    const calls = [];
    if (giftTokenContract.address === feeTokenContract.address) {
      calls.push(giftTokenContract.populateTransaction.approve(factory.address, amount + maxFee));
    } else {
      calls.push(giftTokenContract.populateTransaction.approve(factory.address, amount));
      calls.push(feeTokenContract.populateTransaction.approve(factory.address, maxFee));
    }
    calls.push(
      factory.populateTransaction.deposit(
        giftTokenContract.address,
        amount,
        feeTokenContract.address,
        maxFee,
        claimPubkey,
      ),
    );
    await profiler.profile(
      `Gifting ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await deployer.execute(calls),
    );

    // Get account claiming address 
    const claimAddress = await factory.get_claim_address(
      claimAccountClassHash,
      deployer.address,
      giftTokenContract.address,
      amount,
      feeTokenContract.address,
      maxFee,
      claimPubkey,
    );

    const claim = {
      factory: factory.address,
      class_hash: claimAccountClassHash,
      sender: deployer.address,
      gift_token: giftTokenContract.address,
      gift_amount: uint256.bnToUint256(amount),
      fee_token: feeTokenContract.address,
      fee_amount: maxFee,
      claim_pubkey: claimPubkey,
    };

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
