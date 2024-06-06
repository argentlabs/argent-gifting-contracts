import { deployer, getClaimExternalData, setupGift, setupGiftProtocol } from "../lib";

describe("claim_external", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing claim_external flow using txV3: ${useTxV3}`, async function () {
      const { factory, claimAccountClassHash } = await setupGiftProtocol();
      const { claimAccount, claim, receiver, giftSigner } = await setupGift(factory, claimAccountClassHash, useTxV3);

      const claimExternalData = await getClaimExternalData({ receiver });
      const signature = await giftSigner.signMessage(claimExternalData, claimAccount.address);

      factory.connect(deployer);
      await factory.claim_external(claim, receiver, signature);
    });
  }
});
