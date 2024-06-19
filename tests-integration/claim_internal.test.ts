import { expect } from "chai";
import { num } from "starknet";
import {
  GIFT_MAX_FEE,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Claim Internal", function () {
  for (const useTxV3 of [false, true]) {
    it(`gift token == fee token using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
      const receiver = randomReceiver();
      const claimAddress = calculateClaimAddress(claim);

      await claimInternal({ claim, receiver, claimPrivateKey });

      const finalBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(finalBalance < claim.fee_amount).to.be.true;
      await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(claim.gift_amount);
    });

    it(`Can't claim if no fee amount deposited (fee token == gift token) using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const receiver = randomReceiver();

      const { claim, claimPrivateKey } = await defaultDepositTestSetup({
        factory,
        useTxV3,
        overrides: { giftAmount: 100n, feeAmount: 0n },
      });

      await expect(claimInternal({ claim, receiver, claimPrivateKey })).to.be.rejectedWith(
        "Account balance is smaller than the transaction's max_fee: undefined",
      );
    });

    it(`Test max fee too high using txV3: ${useTxV3}`, async function () {
      // Won't work as we gotta get from the receipt
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
      const receiver = randomReceiver();
      if (useTxV3) {
        const devnetGasPrice = 36000000000n;
        const newResourceBounds = {
          l2_gas: {
            max_amount: "0x0",
            max_price_per_unit: "0x0",
          },
          l1_gas: {
            max_amount: num.toHexString(GIFT_MAX_FEE / devnetGasPrice + 1n), // / 14587088830559n),
            max_price_per_unit: num.toHexString(devnetGasPrice), //14587088830559), // Number taken from the error message
          },
        };
        await expectRevertWithErrorMessage("gift-acc/max-fee-too-high-v3", () =>
          claimInternal({ claim, receiver, claimPrivateKey, details: { resourceBounds: newResourceBounds, tip: 1 } }),
        );
      } else {
        await expectRevertWithErrorMessage("gift-acc/max-fee-too-high-v1", () =>
          claimInternal({
            claim,
            receiver,
            claimPrivateKey,
            details: {
              maxFee: GIFT_MAX_FEE + 1n,
            },
          }),
        );
      }
    });
  }

  it(`Cant call claim internal twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimInternal({ claim, receiver, claimPrivateKey });
    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal({ claim, receiver, claimPrivateKey }),
    );
  });
});
