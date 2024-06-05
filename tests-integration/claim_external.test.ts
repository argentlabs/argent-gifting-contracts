import { deployer, getClaimExternalData, manager } from "../lib";
import { setupClaim } from "./setupClaim";

describe("claim_external", function () {
  before(async () => {
    await manager.declareLocalContract("ClaimAccount");
  });

  for (const useTxV3 of [false, true]) {
    it(`Testing claim_external flow using txV3: ${useTxV3}`, async function () {
      const { factory, claimAccount, claim, receiver, giftSigner } = await setupClaim(useTxV3);

      const claimExternalData = await getClaimExternalData({ receiver });
      const signature = await giftSigner.signMessage(claimExternalData, claimAccount.address);

      factory.connect(deployer);
      await factory.claim_external(claim, receiver, signature);
    });
  }
});
