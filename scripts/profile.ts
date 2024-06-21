import {
  claimExternal,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";
import { newProfiler } from "../lib/gas";

// TODO add this in CI, skipped atm to avoid false failing tests

const profiler = newProfiler(manager);

await manager.restart();
manager.clearClassCache();

const ethContract = await manager.tokens.ethContract();
const strkContract = await manager.tokens.strkContract();

const tokens = [
  { giftTokenContract: ethContract, unit: "WEI" },
  { giftTokenContract: strkContract, unit: "FRI" },
];

ethContract.connect(deployer);
await profiler.profile(
  `Transfer ETH (FeeToken: ${manager.tokens.unitTokenContract(false)})`,
  await ethContract.transfer(randomReceiver(), 1),
);

strkContract.connect(deployer);
await profiler.profile(
  `Transfer STRK (FeeToken: ${manager.tokens.unitTokenContract(false)})`,
  await strkContract.transfer(randomReceiver(), 1),
);

for (const { giftTokenContract, unit } of tokens) {
  for (const useTxV3 of [false, true]) {
    const receiver = "0x42";
    const { factory } = await setupGiftProtocol();

    // Make a gift
    const { txReceipt, claim, claimPrivateKey } = await defaultDepositTestSetup({
      factory,
      useTxV3,
      overrides: {
        claimPrivateKey: 42n,
        giftTokenAddress: giftTokenContract.address,
      },
    });

    const { claim: claimExternalOj, claimPrivateKey: claimPrivateKeyExternal } = await defaultDepositTestSetup({
      factory,
      useTxV3,
      overrides: {
        claimPrivateKey: 43n,
        giftTokenAddress: giftTokenContract.address,
      },
    });

    await profiler.profile(`Gifting ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`, txReceipt);

    await profiler.profile(
      `Claiming ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await claimInternal({ claim, receiver, claimPrivateKey }),
    );

    await profiler.profile(
      `Claiming external ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await claimExternal({ claim: claimExternalOj, receiver, claimPrivateKey: claimPrivateKeyExternal }),
    );
  }
}

profiler.printSummary();
profiler.updateOrCheckReport();
