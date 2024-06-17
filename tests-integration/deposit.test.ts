import { expect } from "chai";
import {
  calculateClaimAddress,
  claimExternal,
  defaultDepositTestSetup,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Deposit", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing claim_external flow using txV3: ${useTxV3} (no dust receiver)`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
      const receiver = randomReceiver();
      const claimAddress = calculateClaimAddress(claim);

      await claimExternal({ claim, receiver, claimPrivateKey });

      const finalBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(finalBalance == claim.fee_amount).to.be.true;
      await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(claim.gift_amount);
    });
  }
});
