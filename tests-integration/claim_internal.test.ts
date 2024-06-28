import { expect } from "chai";
import { num } from "starknet";
import {
  ETH_GIFT_MAX_FEE,
  STRK_GIFT_MAX_FEE,
  buildGiftCallData,
  calculateEscrowAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployMockERC20,
  expectRevertWithErrorMessage,
  getEscrowAccount,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Claim Internal", function () {
  for (const useTxV3 of [false, true]) {
    it(`gift token == fee token using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
      const receiver = randomReceiver();
      const escrowAddress = calculateEscrowAddress(gift);

      await claimInternal({ gift, receiver, giftPrivateKey });

      const finalBalance = await manager.tokens.tokenBalance(escrowAddress, gift.gift_token);
      expect(finalBalance < gift.fee_amount).to.be.true;
      await manager.tokens.tokenBalance(receiver, gift.gift_token).should.eventually.equal(gift.gift_amount);
    });

    it(`fee token not ETH nor STRK using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
      const receiver = randomReceiver();
      const escrowAddress = calculateEscrowAddress(gift);

      const escrowAccount = getEscrowAccount(gift, giftPrivateKey, escrowAddress);
      const mockERC20 = await deployMockERC20();
      gift.fee_token = mockERC20.address;
      await expectRevertWithErrorMessage("escrow/invalid-escrow-address", () =>
        escrowAccount.execute([
          {
            contractAddress: escrowAddress,
            calldata: [buildGiftCallData(gift), receiver],
            entrypoint: "claim_internal",
          },
        ]),
      );
    });

    it(`Invalid calldata using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
      const receiver = randomReceiver();
      const escrowAddress = calculateEscrowAddress(gift);

      const escrowAccount = getEscrowAccount(gift, giftPrivateKey, escrowAddress);
      const mockERC20 = await deployMockERC20();
      gift.fee_token = mockERC20.address;
      await expectRevertWithErrorMessage("escrow/invalid-calldata", () =>
        escrowAccount.execute([
          {
            contractAddress: escrowAddress,
            calldata: [buildGiftCallData(gift), receiver, 1],
            entrypoint: "claim_internal",
          },
        ]),
      );
    });

    it(`Can't claim if no fee amount deposited (fee token == gift token) using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const receiver = randomReceiver();

      const { gift, giftPrivateKey } = await defaultDepositTestSetup({
        factory,
        useTxV3,
        overrides: { feeAmount: 0n },
      });

      const errorMsg = useTxV3 ? "escrow/max-fee-too-high-v3" : "escrow/max-fee-too-high-v1";
      await expectRevertWithErrorMessage(errorMsg, () => claimInternal({ gift, receiver, giftPrivateKey }));
    });

    it(`Test max fee too high using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
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
        await expectRevertWithErrorMessage("escrow/max-fee-too-high-v3", () =>
          claimInternal({
            gift,
            receiver,
            giftPrivateKey,
            details: { resourceBounds: newResourceBounds, tip: 1 },
          }),
        );
      } else {
        await expectRevertWithErrorMessage("escrow/max-fee-too-high-v1", () =>
          claimInternal({
            gift,
            receiver,
            giftPrivateKey,
            details: {
              maxFee: ETH_GIFT_MAX_FEE + 1n,
            },
          }),
        );
      }
    });
  }

  it(`Cant call gift internal twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimInternal({ gift, receiver, giftPrivateKey });
    await expectRevertWithErrorMessage("escr-lib/claimed-or-cancel", () =>
      claimInternal({ gift, receiver, giftPrivateKey }),
    );
  });
});
