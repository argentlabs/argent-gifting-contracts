import { expect } from "chai";
import {
  calculateClaimAddress,
  defaultDepositTestSetup,
  deployMockERC20,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Deposit", function () {
  it(`Double deposit`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const claimPrivateKey = BigInt(randomReceiver());
    await defaultDepositTestSetup({ factory, claimAccountClassHash, overrides: { claimPrivateKey } });
    try {
      await defaultDepositTestSetup({ factory, claimAccountClassHash, overrides: { claimPrivateKey } });
    } catch (e: any) {
      expect(e.toString()).to.include("is unavailable for deployment");
    }
  });

  for (const useTxV3 of [false, true]) {
    it(`Deposit works using txV3: ${useTxV3} (gift token == claim token)`, async function () {
      const { factory, claimAccountClassHash } = await setupGiftProtocol();

      const { claim } = await defaultDepositTestSetup({ factory, claimAccountClassHash, useTxV3 });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance).to.equal(claim.gift_amount + claim.fee_amount);
    });

    it(`Deposit works using txV3: ${useTxV3} with 0 fee amount set (gift token == claim token)`, async function () {
      const { factory, claimAccountClassHash } = await setupGiftProtocol();

      const { claim } = await defaultDepositTestSetup({
        factory,
        claimAccountClassHash,
        useTxV3,
        overrides: { giftAmount: 100n, feeAmount: 0n },
      });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance).to.equal(claim.gift_amount + claim.fee_amount);
    });

    it(`Deposit works using txV3: ${useTxV3} with 0 fee amount set (gift token != claim token)`, async function () {
      const { factory, claimAccountClassHash } = await setupGiftProtocol();
      const giftToken = await deployMockERC20();

      const { claim } = await defaultDepositTestSetup({
        factory,
        claimAccountClassHash,
        useTxV3,
        overrides: { giftAmount: 100n, feeAmount: 0n, giftTokenAddress: giftToken.address },
      });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance).to.equal(claim.gift_amount);

      const feeTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.fee_token);
      expect(feeTokenBalance).to.equal(claim.fee_amount);
    });

    it(`Deposit works using: ${useTxV3} (gift token != claim token)`, async function () {
      const { factory, claimAccountClassHash } = await setupGiftProtocol();
      const giftToken = await deployMockERC20();

      const { claim } = await defaultDepositTestSetup({
        factory,
        claimAccountClassHash,
        useTxV3,
        overrides: { giftTokenAddress: giftToken.address },
      });

      const claimAddress = calculateClaimAddress(claim);

      const giftTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(giftTokenBalance).to.equal(claim.gift_amount);

      const feeTokenBalance = await manager.tokens.tokenBalance(claimAddress, claim.fee_token);
      expect(feeTokenBalance).to.equal(claim.fee_amount);
    });

    it(`Max fee too high claim.gift > claim.fee (gift token == fee token)`, async function () {
      const { factory, claimAccountClassHash } = await setupGiftProtocol();

      await expectRevertWithErrorMessage("gift-fac/fee-too-high", async () => {
        const { txReceipt } = await defaultDepositTestSetup({
          factory,
          claimAccountClassHash,
          useTxV3,
          overrides: { giftAmount: 100n, feeAmount: 101n },
        });
        return txReceipt;
      });
    });
  }

  it("Deposit fails class hash passed != class hash in factory storage", async function () {
    const { factory } = await setupGiftProtocol();
    const invalidClaimAccountClassHash = "0x1234";

    await expectRevertWithErrorMessage("gift-fac/invalid-class-hash", async () => {
      const { txReceipt } = await defaultDepositTestSetup({
        factory,
        claimAccountClassHash: invalidClaimAccountClassHash,
      });
      return txReceipt;
    });
  });

  it("Deposit fails if erc reverts", async function () {
    const brokenERC20 = await manager.deployContract("BrokenERC20", {
      unique: true,
    });
    const { factory, claimAccountClassHash } = await setupGiftProtocol();

    await expectRevertWithErrorMessage("gift-fac/transfer-gift-failed", async () => {
      const { txReceipt } = await defaultDepositTestSetup({
        factory,
        claimAccountClassHash,
        overrides: { giftTokenAddress: brokenERC20.address },
      });
      return txReceipt;
    });
  });
});
