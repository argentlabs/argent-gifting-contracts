import { expect } from "chai";
import type { Erc20Contract } from "starknet-dev-toolkit";
import { expectRevertWithErrorMessage, manager } from "starknet-dev-toolkit";
import { claimInternal, getEscrowAccount, randomReceiver } from "../lib/claim.js";
import { defaultDepositTestSetup, STRK_GIFT_MAX_FEE } from "../lib/deposit.js";
import { setupGiftProtocol } from "../lib/protocol.js";

describe("Claim Internal", function () {
  it(`gift token == fee token`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    await claimInternal({ gift, receiver, giftPrivateKey });

    const finalBalance = await (await manager.tokens.strkContract()).balance_of(escrowAddress);
    expect(finalBalance < gift.feeAmount).to.equal(true);
    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const receiverBalance = await giftToken.balance_of(receiver);
    expect(receiverBalance).to.equal(gift.giftAmount);
  });

  it(`Invalid gift data`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    const escrowAccountAddress = getEscrowAccount(gift, giftPrivateKey, escrowAddress).address;
    gift.feeAmount = 42n;
    await expectRevertWithErrorMessage(
      "escrow/invalid-escrow-address",
      claimInternal({ gift, receiver, giftPrivateKey, overrides: { escrowAccountAddress } }),
    );
  });

  it(`Invalid calldata`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    const escrowAccount = getEscrowAccount(gift, giftPrivateKey);
    await expectRevertWithErrorMessage(
      "escrow/invalid-calldata",
      escrowAccount.execute([
        {
          contractAddress: escrowAccount.address,
          calldata: [gift.toCallData(), receiver, 1],
          entrypoint: "claim_internal",
        },
      ]),
    );
  });

  it(`Can't claim if no fee amount deposited (fee token == gift token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const receiver = randomReceiver();

    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { feeAmount: 0n },
    });

    await expectRevertWithErrorMessage("escrow/max-fee-too-high-v3", claimInternal({ gift, receiver, giftPrivateKey }));
  });

  it(`Test max fee too high`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    const escrowAccount = getEscrowAccount(gift, giftPrivateKey);
    const estimate = await escrowAccount.estimateInvokeFee([
      {
        contractAddress: escrowAccount.address,
        calldata: [gift.toCallData(), receiver],
        entrypoint: "claim_internal",
      },
    ]);

    // Cairo computes: sum(max_amount * max_price_per_unit) + tip * l2_gas.max_amount
    // We use the estimate as baseline, then compute how much extra we need to exceed the limit
    const { l2_gas, l1_gas, l1_data_gas } = estimate.resourceBounds;
    const estimatedTotal =
      l2_gas.max_amount * l2_gas.max_price_per_unit +
      l1_gas.max_amount * l1_gas.max_price_per_unit +
      l1_data_gas.max_amount * l1_data_gas.max_price_per_unit;

    // Calculate extra amount needed to exceed STRK_GIFT_MAX_FEE by 1
    const extraNeeded = STRK_GIFT_MAX_FEE - estimatedTotal;
    // Removing the +1n would make the test fail
    const extraL2GasAmount = extraNeeded / l2_gas.max_price_per_unit + 1n;

    const resourceBounds = {
      ...estimate.resourceBounds,
      l2_gas: {
        max_amount: l2_gas.max_amount + extraL2GasAmount,
        max_price_per_unit: l2_gas.max_price_per_unit,
      },
    };

    await expectRevertWithErrorMessage(
      "escrow/max-fee-too-high-v3",
      claimInternal({
        gift,
        receiver,
        giftPrivateKey,
        details: { resourceBounds, tip: 0 },
      }),
    );
  });

  it(`Cant call gift internal twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimInternal({ gift, receiver, giftPrivateKey });
    await expectRevertWithErrorMessage("escr-lib/claimed-or-cancel", claimInternal({ gift, receiver, giftPrivateKey }));
  });
});
