import { defaultDepositTestSetup, deployer, getClaimExternalData, setupGiftProtocol } from "../lib";

describe("claim_external", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing claim_external flow using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, receiver, claimAccount, claimSigner } = await defaultDepositTestSetup(factory);

      const claimExternalData = await getClaimExternalData({ receiver });
      const signature = await claimSigner.signMessage(claimExternalData, claimAccount.address);

      factory.connect(deployer);
      await factory.claim_external(claim, receiver, signature);
    });
  }
});
