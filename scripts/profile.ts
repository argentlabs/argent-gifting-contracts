import { CallData } from "starknet";
import { deployer, manager, newProfiler } from "starknet-dev-toolkit";
import {
  claimDust,
  claimExternal,
  claimInternal,
  EscrowAction,
  executeActionOnAccount,
  randomReceiver,
} from "../lib/claim.js";
import { defaultDepositTestSetup } from "../lib/deposit.js";
import { setupGiftProtocol } from "../lib/protocol.js";

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

ethContract.providerOrAccount = deployer;
await profiler.profile(`Transfer ETH`, await ethContract.transfer(randomReceiver(), 1));

strkContract.providerOrAccount = deployer;
await profiler.profile(`Transfer STRK`, await strkContract.transfer(randomReceiver(), 1));

const receiver = "0x42";
const { factory } = await setupGiftProtocol();

for (const { giftTokenContract, unit } of tokens) {
  // Profiling deposit
  const { txReceipt, gift, giftPrivateKey } = await defaultDepositTestSetup({
    factory,
    overrides: {
      giftPrivateKey: 42n,
      giftTokenAddress: giftTokenContract.address,
    },
  });

  const { gift: claimExternalGift, giftPrivateKey: giftPrivateKeyExternal } = await defaultDepositTestSetup({
    factory,
    overrides: {
      giftPrivateKey: 43n,
      giftTokenAddress: giftTokenContract.address,
    },
  });

  await profiler.profile(`Gifting ${unit}`, txReceipt);

  // Profiling claim internal
  await profiler.profile(`Claiming ${unit}`, await claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey }));

  // Profiling claim external
  await profiler.profile(
    `Claiming external ${unit}`,
    await claimExternal({ gift: claimExternalGift, receiver, giftPrivateKey: giftPrivateKeyExternal }),
  );

  // Profiling getting the dust
  factory.providerOrAccount = deployer;
  await profiler.profile(`Get dust ${unit}`, await claimDust({ gift, receiver: deployer.address }));
}

const limits = [2, 3, 4, 5];
for (const limit of limits) {
  const claimDustCalls = [];
  for (let i = 0; i < limit; i++) {
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: {
        giftTokenAddress: strkContract.address,
      },
    });

    await claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey });
    const claimDustCallData = CallData.compile([gift.toCallData(), receiver]);
    const call = executeActionOnAccount(EscrowAction.ClaimDust, gift.escrowAddress(), claimDustCallData);

    claimDustCalls.push(call);
  }

  await profiler.profile(`Get dust ${limit}`, await deployer.execute(claimDustCalls));
}

profiler.printSummary();
profiler.updateOrCheckReport();
