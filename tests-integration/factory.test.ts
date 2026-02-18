import { expect } from "chai";
import { num } from "starknet";
import type { Erc20Contract } from "starknet-dev-toolkit";
import { deployer, expectRevertWithErrorMessage, LegacyStarknetKeyPair, manager } from "starknet-dev-toolkit";
import { claimDust, claimInternal, randomReceiver } from "../lib/claim.js";
import { defaultDepositTestSetup, deposit, STRK_GIFT_AMOUNT, STRK_GIFT_MAX_FEE } from "../lib/deposit.js";
import { devnetAccount, setupGiftProtocol } from "../lib/protocol.js";

describe("Test Core Factory Functions", function () {
  it(`Calculate escrow address`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });

    const escrowAddress = await factory.get_escrow_address(
      gift.escrowClassHash,
      deployer.address,
      gift.giftToken,
      gift.giftAmount,
      gift.feeToken,
      gift.feeAmount,
      gift.giftPubkey,
    );

    const correctAddress = gift.escrowAddress();
    expect(escrowAddress).to.be.equal(num.toBigInt(correctAddress));
  });

  it(`claim_dust`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const dustReceiver = randomReceiver();

    await claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey });
    const escrowAddress = gift.escrowAddress();

    // Final check
    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const dustBalance = await giftToken.balance_of(escrowAddress);
    expect(dustBalance < STRK_GIFT_MAX_FEE).to.equal(true);
    expect(await giftToken.balance_of(receiver)).to.equal(STRK_GIFT_AMOUNT);

    // Test dust
    expect(await giftToken.balance_of(dustReceiver)).to.equal(0n);

    await claimDust({ gift, receiver: dustReceiver });

    expect(await giftToken.balance_of(escrowAddress)).to.equal(0n);
    expect(await giftToken.balance_of(dustReceiver)).to.equal(dustBalance);
  });

  it(`Shouldn't be possible to claim_dust for an unclaimed gift`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const dustReceiver = randomReceiver();
    // original: "escr-lib/not-yet-claimed"
    await expectRevertWithErrorMessage("Result::unwrap failed.", claimDust({ gift, receiver: dustReceiver }));
  });

  it(`Pausable`, async function () {
    // Deploy factory
    const { factory } = await setupGiftProtocol();
    const receiver = randomReceiver();
    const giftSigner = new LegacyStarknetKeyPair();

    const token = await manager.tokens.strkContract();

    // pause / unpause
    factory.providerOrAccount = deployer;
    const { transaction_hash: txHash1 } = await factory.pause();
    await manager.waitForTransaction(txHash1);

    await expectRevertWithErrorMessage(
      "Pausable: paused",
      (async () => {
        const { response } = await deposit({
          sender: deployer,
          giftAmount: STRK_GIFT_AMOUNT,
          feeAmount: STRK_GIFT_MAX_FEE,
          factoryAddress: factory.address,
          feeTokenAddress: token.address,
          giftTokenAddress: token.address,
          giftSignerPubKey: giftSigner.publicKey,
        });
        return response;
      })(),
    );

    const { transaction_hash: txHash2 } = await factory.unpause();
    await manager.waitForTransaction(txHash2);
    const { gift } = await defaultDepositTestSetup({
      factory,
      overrides: { giftPrivateKey: BigInt(giftSigner.privateKey) },
    });
    await claimInternal({
      gift,
      receiver,
      giftPrivateKey: giftSigner.privateKey,
    });
  });

  describe("Ownable", function () {
    it("Pause", async function () {
      const { factory } = await setupGiftProtocol();

      factory.providerOrAccount = devnetAccount();
      await expectRevertWithErrorMessage("Caller is not the owner", factory.pause());
    });

    it("Unpause", async function () {
      const { factory } = await setupGiftProtocol();

      factory.providerOrAccount = deployer;
      await factory.pause();

      factory.providerOrAccount = devnetAccount();
      await expectRevertWithErrorMessage("Caller is not the owner", factory.unpause());

      // needed for next tests
      factory.providerOrAccount = deployer;
      await factory.unpause();
    });

    it("Ownable: Get Dust", async function () {
      const { factory } = await setupGiftProtocol();
      const { gift } = await defaultDepositTestSetup({ factory });
      const dustReceiver = randomReceiver();

      // original: "escr-lib/only-factory-owner"
      await expectRevertWithErrorMessage(
        "Result::unwrap failed.",
        claimDust({ gift, receiver: dustReceiver, factoryOwner: devnetAccount() }),
      );
    });
  });
});
