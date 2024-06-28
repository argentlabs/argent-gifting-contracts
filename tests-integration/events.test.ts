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
    const { factory, escrowAccountClassHash } = await setupGiftProtocol();
    const { gift, txReceipt } = await defaultDepositTestSetup({ factory });

    const escrowAddress = calculateEscrowAddress(gift);

    await expectEvent(txReceipt.transaction_hash, {
      from_address: factory.address,
      eventName: "GiftCreated",
      keys: [escrowAddress, deployer.address],
      data: CallData.compile([
        escrowAccountClassHash,
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
    const { gift } = await defaultDepositTestSetup({ factory });

    const { transaction_hash } = await cancelGift({ gift });

    const escrowAddress = calculateEscrowAddress(gift);

    await expectEvent(transaction_hash, {
      from_address: escrowAddress,
      eventName: "GiftCancelled",
    });
  });

  it("Claim Internal", async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const dustReceiver = "0x0";

    const { transaction_hash } = await claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey });

    const escrowAddress = calculateEscrowAddress(gift);

    await expectEvent(transaction_hash, {
      from_address: escrowAddress,
      eventName: "GiftClaimed",
      data: [receiver, dustReceiver],
    });
  });

  it("Claim External", async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const dustReceiver = randomReceiver();

    const { transaction_hash } = await claimExternal({
      gift,
      receiver,
      giftPrivateKey: giftPrivateKey,
      dustReceiver,
    });

    const escrowAddress = calculateEscrowAddress(gift);

    await expectEvent(transaction_hash, {
      from_address: escrowAddress,
      eventName: "GiftClaimed",
      data: [receiver, dustReceiver],
    });
  });
});
