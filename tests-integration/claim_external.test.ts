import { defaultDepositTestSetup, randomReceiver, setupGiftProtocol } from "../lib";

describe("claim_external", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing claim_external flow using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const claim = await defaultDepositTestSetup(factory);
      const receiver = randomReceiver();

      await claim.claimExternal(receiver);
    });
  }
});
