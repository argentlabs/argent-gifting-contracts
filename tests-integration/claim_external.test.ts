import { deployer, getClaimExternalData, manager } from "../lib";
import { GIFT_SIGNER, setupClaim } from "./setupClaim";

describe("claim_external", function () {
  before(async () => {
    await manager.declareLocalContract("ClaimAccount");
  });

  for (const useTxV3 of [false, true]) {
    it(`Testing claim_external flow using txV3: ${useTxV3}`, async function () {
      const { factory, claimAccount, claim, receiver } = await setupClaim(useTxV3);

      const claimExternalData = await getClaimExternalData({ receiver });
      const signature = await GIFT_SIGNER.signMessage(claimExternalData, claimAccount.address);

      factory.connect(deployer);
      await factory.claim_external(claim, receiver, signature);
    });
  }
});
