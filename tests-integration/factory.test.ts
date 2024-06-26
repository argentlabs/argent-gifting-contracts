import { expect } from "chai";
import { num, RPC } from "starknet";
import {
  calculateEscrowAddress,
  claimDust,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  deposit,
  devnetAccount,
  ETH_GIFT_AMOUNT,
  ETH_GIFT_MAX_FEE,
  expectRevertWithErrorMessage,
  getGiftAmount,
  getMaxFee,
  LegacyStarknetKeyPair,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Test Core Factory Functions", function () {
  it(`Calculate escrow address`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift } = await defaultDepositTestSetup({ factory });

    const claimAddress = await factory.get_escrow_address(
      gift.class_hash,
      deployer.address,
      gift.gift_token,
      gift.gift_amount,
      gift.fee_token,
      gift.fee_amount,
      gift.gift_pubkey,
    );

    const correctAddress = calculateEscrowAddress(gift);
    expect(claimAddress).to.be.equal(num.toBigInt(correctAddress));
  });

  for (const useTxV3 of [false, true]) {
    it(`claim_dust: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
      const receiver = randomReceiver();
      const dustReceiver = randomReceiver();

      await claimInternal({ gift: gift, receiver, giftPrivateKey: giftPrivateKey });
      const claimAddress = calculateEscrowAddress(gift);

      // Final check
      const dustBalance = await manager.tokens.tokenBalance(claimAddress, gift.gift_token);
      const maxFee = getMaxFee(useTxV3);
      const giftAmount = getGiftAmount(useTxV3);
      expect(dustBalance < maxFee).to.be.true;
      await manager.tokens.tokenBalance(receiver, gift.gift_token).should.eventually.equal(giftAmount);

      // Test dust
      await manager.tokens.tokenBalance(dustReceiver, gift.gift_token).should.eventually.equal(0n);

      await claimDust({ gift: gift, receiver: dustReceiver });

      await manager.tokens.tokenBalance(claimAddress, gift.gift_token).should.eventually.equal(0n);
      await manager.tokens.tokenBalance(dustReceiver, gift.gift_token).should.eventually.equal(dustBalance);
    });
  }

  it(`Pausable`, async function () {
    // Deploy factory
    const { factory } = await setupGiftProtocol();
    const receiver = randomReceiver();
    const giftSigner = new LegacyStarknetKeyPair();

    const token = await manager.tokens.feeTokenContract(false);

    // pause / unpause
    factory.connect(deployer);
    const { transaction_hash: txHash1 } = await factory.pause();
    await manager.waitForTransaction(txHash1);

    await expectRevertWithErrorMessage("Pausable: paused", async () => {
      const { response } = await deposit({
        sender: deployer,
        giftAmount: ETH_GIFT_AMOUNT,
        feeAmount: ETH_GIFT_MAX_FEE,
        factoryAddress: factory.address,
        feeTokenAddress: token.address,
        giftTokenAddress: token.address,
        giftSignerPubKey: giftSigner.publicKey,
      });
      return response;
    });

    const { transaction_hash: txHash2 } = await factory.unpause();
    await manager.waitForTransaction(txHash2);
    const { gift: gift } = await defaultDepositTestSetup({
      factory,
      overrides: { giftPrivateKey: BigInt(giftSigner.privateKey) },
    });
    const { execution_status } = await claimInternal({
      gift: gift,
      receiver,
      giftPrivateKey: giftSigner.privateKey,
    });
    expect(execution_status).to.be.equal(RPC.ETransactionExecutionStatus.SUCCEEDED);
  });

  describe("Ownable", function () {
    it("Pause", async function () {
      const { factory } = await setupGiftProtocol();

      factory.connect(devnetAccount());
      await expectRevertWithErrorMessage("Caller is not the owner", () => factory.pause());
    });

    it("Unpause", async function () {
      const { factory } = await setupGiftProtocol();

      factory.connect(deployer);
      await factory.pause();

      factory.connect(devnetAccount());
      await expectRevertWithErrorMessage("Caller is not the owner", () => factory.unpause());

      // needed for next tests
      factory.connect(deployer);
      await factory.unpause();
    });

    it("Ownable: Get Dust", async function () {
      const { factory } = await setupGiftProtocol();
      const { gift: gift } = await defaultDepositTestSetup({ factory });
      const dustReceiver = randomReceiver();

      await expectRevertWithErrorMessage("gift/only-factory-owner", () =>
        claimDust({ gift: gift, receiver: dustReceiver, factoryOwner: devnetAccount() }),
      );
    });
  });
});
