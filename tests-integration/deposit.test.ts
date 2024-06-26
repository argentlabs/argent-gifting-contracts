import { expect } from "chai";
import {
  calculateEscrowAddress,
  defaultDepositTestSetup,
  deployMockERC20,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Deposit", function () {
  it(`Double deposit`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftPrivateKey = BigInt(randomReceiver());
    await defaultDepositTestSetup({ factory, overrides: { giftPrivateKey } });
    try {
      await defaultDepositTestSetup({ factory, overrides: { giftPrivateKey } });
    } catch (e: any) {
      expect(e.toString()).to.include("is unavailable for deployment");
    }
  });

  for (const useTxV3 of [false, true]) {
    it(`Deposit works using txV3: ${useTxV3} (gift token == gift token)`, async function () {
      const { factory } = await setupGiftProtocol();

      const { gift } = await defaultDepositTestSetup({ factory, useTxV3 });

      const escrowAddress = calculateEscrowAddress(gift);

      const giftTokenBalance = await manager.tokens.tokenBalance(escrowAddress, gift.gift_token);
      expect(giftTokenBalance).to.equal(gift.gift_amount + gift.fee_amount);
    });

    it(`Deposit works using txV3: ${useTxV3} with 0 fee amount set (gift token == gift token)`, async function () {
      const { factory } = await setupGiftProtocol();

      const { gift } = await defaultDepositTestSetup({
        factory,
        useTxV3,
        overrides: { giftAmount: 100n, feeAmount: 0n },
      });

      const escrowAddress = calculateEscrowAddress(gift);

      const giftTokenBalance = await manager.tokens.tokenBalance(escrowAddress, gift.gift_token);
      expect(giftTokenBalance).to.equal(gift.gift_amount + gift.fee_amount);
    });

    it(`Deposit works using txV3: ${useTxV3} with 0 fee amount set (gift token != gift token)`, async function () {
      const { factory } = await setupGiftProtocol();
      const giftToken = await deployMockERC20();

      const { gift } = await defaultDepositTestSetup({
        factory,
        useTxV3,
        overrides: { giftAmount: 100n, feeAmount: 0n, giftTokenAddress: giftToken.address },
      });

      const escrowAddress = calculateEscrowAddress(gift);

      const giftTokenBalance = await manager.tokens.tokenBalance(escrowAddress, gift.gift_token);
      expect(giftTokenBalance).to.equal(gift.gift_amount);

      const feeTokenBalance = await manager.tokens.tokenBalance(escrowAddress, gift.fee_token);
      expect(feeTokenBalance).to.equal(gift.fee_amount);
    });

    it(`Deposit works using: ${useTxV3} (gift token != gift token)`, async function () {
      const { factory } = await setupGiftProtocol();
      const giftToken = await deployMockERC20();

      const { gift } = await defaultDepositTestSetup({
        factory,
        useTxV3,
        overrides: { giftTokenAddress: giftToken.address },
      });

      const escrowAddress = calculateEscrowAddress(gift);

      const giftTokenBalance = await manager.tokens.tokenBalance(escrowAddress, gift.gift_token);
      expect(giftTokenBalance).to.equal(gift.gift_amount);

      const feeTokenBalance = await manager.tokens.tokenBalance(escrowAddress, gift.fee_token);
      expect(feeTokenBalance).to.equal(gift.fee_amount);
    });

    it(`Max fee too high gift.gift > gift.fee (gift token == fee token)`, async function () {
      const { factory } = await setupGiftProtocol();

      await expectRevertWithErrorMessage("gift-fac/fee-too-high", async () => {
        const { txReceipt } = await defaultDepositTestSetup({
          factory,
          useTxV3,
          overrides: { giftAmount: 100n, feeAmount: 101n },
        });
        return txReceipt;
      });
    });
  }

  it("Deposit fails class hash passed != class hash in factory storage", async function () {
    const { factory } = await setupGiftProtocol();
    const invalidEscrowAccountClassHash = "0x1234";

    await expectRevertWithErrorMessage("gift-fac/invalid-class-hash", async () => {
      const { txReceipt } = await defaultDepositTestSetup({
        factory,
        overrides: {
          escrowAccountClassHash: invalidEscrowAccountClassHash,
        },
      });
      return txReceipt;
    });
  });

  it("Deposit fails if erc reverts", async function () {
    const brokenERC20 = await manager.deployContract("BrokenERC20", {
      unique: true,
    });
    const { factory } = await setupGiftProtocol();

    await expectRevertWithErrorMessage("gift-fac/transfer-gift-failed", async () => {
      const { txReceipt } = await defaultDepositTestSetup({
        factory,
        overrides: { giftTokenAddress: brokenERC20.address },
      });
      return txReceipt;
    });
  });
});
