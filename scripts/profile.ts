import { CallData } from "starknet";
import {
  buildGiftCallData,
  calculateEscrowAddress,
  claimDust,
  claimExternal,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  executeActionOnAccount,
  manager,
  randomReceiver,
  setDefaultTransactionVersionV3,
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

const receiver = "0x42";
const { factory } = await setupGiftProtocol();

for (const { giftTokenContract, unit } of tokens) {
  for (const useTxV3 of [false, true]) {
    // Profiling deposit
    const { txReceipt, gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      useTxV3,
      overrides: {
        giftPrivateKey: 42n,
        giftTokenAddress: giftTokenContract.address,
      },
    });

    const { gift: claimExternalGift, giftPrivateKey: giftPrivateKeyExternal } = await defaultDepositTestSetup({
      factory,
      useTxV3,
      overrides: {
        giftPrivateKey: 43n,
        giftTokenAddress: giftTokenContract.address,
      },
    });

    await profiler.profile(`Gifting ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`, txReceipt);

    // Profiling claim internal
    await profiler.profile(
      `Claiming ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey }),
    );

    // Profiling claim external
    await profiler.profile(
      `Claiming external ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await claimExternal({ gift: claimExternalGift, receiver, useTxV3, giftPrivateKey: giftPrivateKeyExternal }),
    );

    // Profiling getting the dust
    const account = useTxV3 ? setDefaultTransactionVersionV3(deployer) : deployer;
    factory.connect(account);
    await profiler.profile(
      `Get dust ${unit} (FeeToken: ${manager.tokens.unitTokenContract(useTxV3)})`,
      await claimDust({ gift, receiver: deployer.address }),
    );
  }
}

const limits = [2, 3, 4, 5];
for (const limit of limits) {
  const claimDustCalls = [];
  for (let i = 0; i < limit; i++) {
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: {
        giftTokenAddress: ethContract.address,
      },
    });

    await claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey });
    const claimDustCallData = CallData.compile([buildGiftCallData(gift), receiver]);
    const call = executeActionOnAccount("claim_dust", calculateEscrowAddress(gift), claimDustCallData);

    claimDustCalls.push(call);
  }

  await profiler.profile(
    `Get dust ${limit} (FeeToken: ${manager.tokens.unitTokenContract(false)})`,
    await deployer.execute(claimDustCalls),
  );
}

profiler.printSummary();
profiler.updateOrCheckReport();
