import { CallData, uint256 } from "starknet";
import {
  calculateEscrowAddress,
  cancelGift,
  claimExternal,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  expectEvent,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("All events are emitted", function () {
  it("Deposit", async function () {
    const { factory, escrowAccountClassHash: EscrowAccountClassHash } = await setupGiftProtocol();
    const { gift: gift, txReceipt } = await defaultDepositTestSetup({ factory });

    const claimAddress = calculateEscrowAddress(gift);

    await expectEvent(txReceipt.transaction_hash, {
      from_address: factory.address,
      eventName: "GiftCreated",
      keys: [claimAddress, deployer.address],
      data: CallData.compile([
        EscrowAccountClassHash,
        gift.gift_token,
        uint256.bnToUint256(gift.gift_amount),
        gift.fee_token,
        gift.fee_amount,
        gift.gift_pubkey,
      ]),
    });
  });

  it("Cancelled", async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift } = await defaultDepositTestSetup({ factory });

    const { transaction_hash } = await cancelGift({ gift: gift });

    const claimAddress = calculateEscrowAddress(gift);

    await expectEvent(transaction_hash, {
      from_address: claimAddress,
      eventName: "GiftCancelled",
    });
  });

  it("Claimed Internal", async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const dustReceiver = "0x0";

    const { transaction_hash } = await claimInternal({ gift: gift, receiver, giftPrivateKey: giftPrivateKey });

    const claimAddress = calculateEscrowAddress(gift);

    await expectEvent(transaction_hash, {
      from_address: claimAddress,
      eventName: "GiftClaimed",
      data: [receiver, dustReceiver],
    });
  });

  it("Claimed External", async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const dustReceiver = randomReceiver();

    const { transaction_hash } = await claimExternal({
      gift: gift,
      receiver,
      giftPrivateKey: giftPrivateKey,
      dustReceiver,
    });

    const claimAddress = calculateEscrowAddress(gift);

    await expectEvent(transaction_hash, {
      from_address: claimAddress,
      eventName: "GiftClaimed",
      data: [receiver, dustReceiver],
    });
  });
});
