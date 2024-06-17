import { expect } from "chai";
import {
  calculateClaimAddress,
  defaultDepositTestSetup,
  deployMockERC20,
  expectRevertWithErrorMessage,
  manager,
  setupGiftProtocol,
} from "../lib";

describe("Deposit", function () {
  for (const useTxV3 of [false, true]) {
    it(`Deposit works using txV3: ${useTxV3} (gift token == claim token)`, async function () {
      const { factory } = await setupGiftProtocol();

      const { claim } = await defaultDepositTestSetup({ factory, useTxV3 });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance == claim.gift_amount + claim.fee_amount).to.be.true;
    });

    it(`Deposit works using txV3: ${useTxV3} with 0 fee amount set (gift token == claim token)`, async function () {
      const { factory } = await setupGiftProtocol();

      const { claim } = await defaultDepositTestSetup({
        factory,
        useTxV3,
        overrides: { giftAmount: 100n, feeAmount: 0n },
      });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance == claim.gift_amount + claim.fee_amount).to.be.true;
    });

    it(`Deposit works using txV3: ${useTxV3} with 0 fee amount set (gift token != claim token)`, async function () {
      const { factory } = await setupGiftProtocol();
      const giftToken = await deployMockERC20();

      const { claim } = await defaultDepositTestSetup({
        factory,
        useTxV3,
        overrides: { giftAmount: 100n, feeAmount: 0n, giftTokenAddress: giftToken.address },
      });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance == claim.gift_amount).to.be.true;

      const feeTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.fee_token);
      expect(feeTokenBalance == claim.fee_amount).to.be.true;
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

    it(`Max fee too high claim.gift > claim.fee (gift token == fee token)`, async function () {
      const { factory } = await setupGiftProtocol();

      await expectRevertWithErrorMessage("gift-fac/fee-too-high", async () => {
        const { response } = await defaultDepositTestSetup({
          factory,
          useTxV3,
          overrides: { giftAmount: 100n, feeAmount: 101n },
        });
        return response;
      });
    });
  }
  it("Deposit fails if erc reverts", async function () {
    const brokenERC20 = await manager.deployContract("BrokenERC20", {
      unique: true,
    });
    const { factory } = await setupGiftProtocol();

    await expectRevertWithErrorMessage("gift-fac/transfer-gift-failed", async () => {
      const { response } = await defaultDepositTestSetup({
        factory,
        overrides: { giftTokenAddress: brokenERC20.address },
      });
      return response;
    });
  });
});
