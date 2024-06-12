import { claimInternal, defaultDepositTestSetup, deployer, manager, setupGiftProtocol } from "../lib";
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
    const receiver = "0x42";
    const { factory } = await setupGiftProtocol();

    // Make a gift
    const { response, claim, claimPrivateKey } = await defaultDepositTestSetup(
      factory,
      useTxV3,
      42n,
      giftTokenContract.address,
    );

    await profiler.profile(`Gifting ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`, response);

    await profiler.profile(
      `Claiming ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await claimInternal(claim, receiver, claimPrivateKey),
    );
  }
}

profiler.printSummary();
profiler.updateOrCheckReport();
