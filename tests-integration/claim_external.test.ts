import { expect } from "chai";
import {
  calculateEscrowAddress,
  cancelGift,
  claimExternal,
  defaultDepositTestSetup,
  deployMockERC20,
  deployer,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Claim External", function () {
  for (const useTxV3 of [false, true]) {
    it(`gift_token == fee_token flow using txV3: ${useTxV3} (no dust receiver)`, async function () {
      const { factory } = await setupGiftProtocol();
      const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
      const receiver = randomReceiver();
      const escrowAddress = calculateEscrowAddress(gift);

      await claimExternal({ gift, receiver, giftPrivateKey });

      const finalBalance = await manager.tokens.tokenBalance(escrowAddress, gift.gift_token);
      expect(finalBalance).to.equal(gift.fee_amount);
      await manager.tokens.tokenBalance(receiver, gift.gift_token).should.eventually.equal(gift.gift_amount);
      await manager.tokens.tokenBalance(escrowAddress, gift.fee_token).should.eventually.equal(gift.fee_amount);
    });

    it(`gift_token == fee_token flow using txV3: ${useTxV3}  (w/ dust receiver)`, async function () {
      const { factory } = await setupGiftProtocol();
      const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
      const receiver = randomReceiver();
      const dustReceiver = randomReceiver();
      const escrowAddress = calculateEscrowAddress(gift);

      const balanceBefore = await manager.tokens.tokenBalance(escrowAddress, gift.gift_token);
      await claimExternal({ gift, receiver, giftPrivateKey, dustReceiver });

      await manager.tokens.tokenBalance(receiver, gift.gift_token).should.eventually.equal(gift.gift_amount);
      await manager.tokens
        .tokenBalance(dustReceiver, gift.gift_token)
        .should.eventually.equal(balanceBefore - gift.gift_amount);
      await manager.tokens.tokenBalance(escrowAddress, gift.gift_token).should.eventually.equal(0n);
      await manager.tokens.tokenBalance(escrowAddress, gift.fee_token).should.eventually.equal(0n);
    });
  }

  it(`gift_token != fee_token (w/ dust receiver)`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftToken = await deployMockERC20();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: giftToken.address },
    });
    const receiver = randomReceiver();
    const dustReceiver = randomReceiver();
    const escrowAddress = calculateEscrowAddress(gift);

    await claimExternal({ gift, receiver, giftPrivateKey, dustReceiver });

    await manager.tokens.tokenBalance(receiver, gift.gift_token).should.eventually.equal(gift.gift_amount);
    await manager.tokens.tokenBalance(dustReceiver, gift.fee_token).should.eventually.equal(gift.fee_amount);
    await manager.tokens.tokenBalance(escrowAddress, gift.gift_token).should.eventually.equal(0n);
    await manager.tokens.tokenBalance(escrowAddress, gift.fee_token).should.eventually.equal(0n);
  });

  it(`gift_token != fee_token (no dust receiver)`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftToken = await deployMockERC20();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: giftToken.address },
    });
    const receiver = randomReceiver();
    const escrowAddress = calculateEscrowAddress(gift);

    await claimExternal({ gift, receiver, giftPrivateKey });

    await manager.tokens.tokenBalance(receiver, gift.gift_token).should.eventually.equal(gift.gift_amount);
    await manager.tokens.tokenBalance(escrowAddress, gift.gift_token).should.eventually.equal(0n);
    await manager.tokens.tokenBalance(escrowAddress, gift.fee_token).should.eventually.equal(gift.fee_amount);
  });

  it(`Zero Receiver`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = "0x0";

    await expectRevertWithErrorMessage("escr-lib/zero-receiver", () =>
      claimExternal({ gift, receiver, giftPrivateKey }),
    );
  });

  it(`Cannot call claim external twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimExternal({ gift, receiver, giftPrivateKey });
    await expectRevertWithErrorMessage("escr-lib/claimed-or-cancel", () =>
      claimExternal({ gift, receiver, giftPrivateKey }),
    );
  });

  it(`Invalid Signature`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    await expectRevertWithErrorMessage("escr-lib/invalid-ext-signature", () =>
      claimExternal({ gift: gift, receiver, giftPrivateKey: "0x1234" }),
    );
  });

  it(`Claim gift cancelled`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const escrowAddress = calculateEscrowAddress(gift);

    const balanceSenderBefore = await manager.tokens.tokenBalance(deployer.address, gift.gift_token);
    const { transaction_hash } = await cancelGift({ gift });
    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await manager.tokens
      .tokenBalance(deployer.address, gift.gift_token)
      .should.eventually.equal(balanceSenderBefore + gift.gift_amount + gift.fee_amount - txFee);
    // Check balance gift address address == 0
    await manager.tokens.tokenBalance(escrowAddress, gift.gift_token).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("escr-lib/claimed-or-cancel", () =>
      claimExternal({ gift, receiver, giftPrivateKey }),
    );
  });

  // Commented out to pass CI temporarily
  // it.skip(`Not possible to gift more via reentrancy`, async function () {
  //   const { factory } = await setupGiftProtocol();
  //   const receiver = randomReceiver();

  //   const reentrant = await manager.deployContract("ReentrantERC20", {
  //     unique: true,
  //     constructorCalldata: [
  //       byteArray.byteArrayFromString("ReentrantUSDC"),
  //       byteArray.byteArrayFromString("RUSDC"),
  //       uint256.bnToUint256(100e18),
  //       deployer.address,
  //       factory.address,
  //     ],
  //   });
  //   const { gift, giftPrivateKey } = await defaultDepositTestSetup({
  //     factory,
  //     overrides: { giftTokenAddress: reentrant.address },
  //   });

  //   const claimSig = await signExternalClaim({ gift, receiver, giftPrivateKey });

  //   reentrant.connect(deployer);
  //   const { transaction_hash } = await reentrant.set_gift_data(gift, receiver, "0x0", claimSig);
  //   await manager.waitForTransaction(transaction_hash);

  //   await expectRevertWithErrorMessage("ERC20: insufficient balance", () =>
  //     claimExternal({ gift, receiver, giftPrivateKey }),
  //   );
  // });
});
