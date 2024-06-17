import { expect } from "chai";
import { calculateClaimAddress, defaultDepositTestSetup, deployMockERC20, manager, setupGiftProtocol } from "../lib";

describe("Deposit", function () {
  for (const useTxV3 of [false, true]) {
    it(`Deposit works using: ${useTxV3} (gift token == claim token)`, async function () {
      const { factory } = await setupGiftProtocol();

      const { claim } = await defaultDepositTestSetup({ factory, useTxV3 });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance == claim.gift_amount + claim.fee_amount).to.be.true;
    });

    it(`Deposit works using: ${useTxV3} (gift token != claim token)`, async function () {
      const { factory } = await setupGiftProtocol();
      const giftToken = await deployMockERC20();

      const { claim } = await defaultDepositTestSetup({
        factory,
        useTxV3,
        overrides: { giftTokenAddress: giftToken.address },
      });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance == claim.gift_amount).to.be.true;

      const feeTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.fee_token);
      expect(feeTokenBalance == claim.fee_amount).to.be.true;
    });
  }
});
