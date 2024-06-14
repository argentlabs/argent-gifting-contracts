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
    it(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, useTxV3);
      const receiver = randomReceiver();
      const claimAddress = calculateClaimAddress(claim);

      await claimInternal({ claim, receiver, claimPrivateKey });

      const token = await manager.loadContract(claim.gift_token);
      const finalBalance = await token.balance_of(claimAddress);
      expect(finalBalance < claim.fee_amount).to.be.true;
      await token.balance_of(receiver).should.eventually.equal(claim.gift_amount);
    });

    it(`Test max fee too high using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, useTxV3);
      const receiver = randomReceiver();
      if (useTxV3) {
        const newResourceBounds = {
          l2_gas: {
            max_amount: num.toHexString(GIFT_MAX_FEE),
            max_price_per_unit: num.toHexString(1),
          },
          l1_gas: {
            max_amount: "0x0",
            max_price_per_unit: "0x0",
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

  it(`Call claim internal twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    await claimInternal({ claim, receiver, claimPrivateKey });
    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal({ claim, receiver, claimPrivateKey }),
    );
  });
});
