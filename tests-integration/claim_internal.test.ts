import { expect } from "chai";
import { num } from "starknet";
import {
  ETH_GIFT_MAX_FEE,
  STRK_GIFT_MAX_FEE,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

// FILE TESTED SUCCESSFULLY
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
        overrides: { feeAmount: 0n },
      });

      const errorMsg = useTxV3 ? "gift-acc/max-fee-too-high-v3" : "gift-acc/max-fee-too-high-v1";
      await expectRevertWithErrorMessage(errorMsg, () => claimInternal({ claim, receiver, claimPrivateKey }));
    });

    it(`Test max fee too high using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
      const receiver = randomReceiver();
      if (useTxV3) {
        // If you run this test on testnet, it'll fail
        // You can then take the value from the error message and replace 1n (given some extra iff the price rises)
        const gasPrice = manager.isDevnet ? 36000000000n : 1n;
        const newResourceBounds = {
          l2_gas: {
            max_amount: "0x0",
            max_price_per_unit: "0x0",
          },
          l1_gas: {
            max_amount: num.toHexString(STRK_GIFT_MAX_FEE / gasPrice + 1n),
            max_price_per_unit: num.toHexString(gasPrice),
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
              maxFee: ETH_GIFT_MAX_FEE + 1n,
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
