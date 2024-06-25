import { CallData, uint256 } from "starknet";
import {
  calculateClaimAddress,
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
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, txReceipt } = await defaultDepositTestSetup({ factory, claimAccountClassHash });

    const claimAddress = calculateClaimAddress(claim);

    await expectEvent(txReceipt.transaction_hash, {
      from_address: factory.address,
      eventName: "GiftCreated",
      keys: [claimAddress, deployer.address],
      data: CallData.compile([
        claimAccountClassHash,
        claim.gift_token,
        uint256.bnToUint256(claim.gift_amount),
        claim.fee_token,
        claim.fee_amount,
        claim.claim_pubkey,
      ]),
    });
  });

  it("Cancelled", async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup({ factory, claimAccountClassHash });

    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim);

    const claimAddress = calculateClaimAddress(claim);

    await expectEvent(transaction_hash, {
      from_address: factory.address,
      eventName: "GiftCancelled",
      keys: [claimAddress],
    });
  });

  it("Claimed Internal", async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, claimAccountClassHash });
    const receiver = randomReceiver();
    const dustReceiver = "0x0";

    const { transaction_hash } = await claimInternal({ claim, receiver, claimPrivateKey });

    const claimAddress = calculateClaimAddress(claim);

    await expectEvent(transaction_hash, {
      from_address: factory.address,
      eventName: "GiftClaimed",
      keys: [claimAddress],
      data: [receiver, dustReceiver],
    });
  });

  it("Claimed External", async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, claimAccountClassHash });
    const receiver = randomReceiver();
    const dustReceiver = randomReceiver();

    const { transaction_hash } = await claimExternal({ claim, receiver, claimPrivateKey, dustReceiver });

    const claimAddress = calculateClaimAddress(claim);

    await expectEvent(transaction_hash, {
      from_address: factory.address,
      eventName: "GiftClaimed",
      keys: [claimAddress],
      data: [receiver, dustReceiver],
    });
  });
});
