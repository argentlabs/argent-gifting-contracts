import { expect } from "chai";
import { ec, encode, num } from "starknet";
import {
  GIFT_AMOUNT,
  GIFT_MAX_FEE,
  LegacyStarknetKeyPair,
  defaultDepositTestSetup,
  deployer,
  expectRevertWithErrorMessage,
  genericAccount,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Factory", function () {
  it(`Test calculate claim address`, async function () {
    const { factory } = await setupGiftProtocol();
    const claim = await defaultDepositTestSetup(factory);

    const claimAddress = await factory.get_claim_address(
      claim.classHash,
      deployer.address,
      claim.giftToken,
      claim.giftAmount,
      claim.feeToken,
      claim.feeAmount,
      claim.claim_pubkey,
    );
    expect(claimAddress).to.be.equal(num.toBigInt(claim.claimAddress));
  });

  for (const useTxV3 of [false, true]) {
    it(`get_dust: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const claim = await defaultDepositTestSetup(factory);
      const receiver = randomReceiver();
      const receiverDust = randomReceiver();

      await claim.claimInternal(receiver);
      const token = await manager.loadContract(claim.giftToken);

      // Final check

      const dustBalance = await token.balance_of(claim.claimAddress);
      expect(dustBalance < GIFT_MAX_FEE).to.be.true;
      await token.balance_of(receiver).should.eventually.equal(GIFT_AMOUNT);

      // Test dust
      await token.balance_of(receiverDust).should.eventually.equal(0n);

      factory.connect(deployer);
      await factory.get_dust(claim.callDataClaim, receiverDust);
      await token.balance_of(claim.claimAddress).should.eventually.equal(0n);
      await token.balance_of(receiverDust).should.eventually.equal(dustBalance);
    });
  }

  it(`Test Cancel Claim`, async function () {
    const { factory } = await setupGiftProtocol();
    const claim = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();
    const token = await manager.loadContract(claim.giftToken);

    const balanceSenderBefore = await token.balance_of(deployer.address);
    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim.callDataClaim);
    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await token
      .balance_of(deployer.address)
      .should.eventually.equal(balanceSenderBefore + claim.giftAmount + claim.feeAmount - txFee);
    // Check balance claim address address == 0
    await token.balance_of(claim.claimAddress).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () => claim.claimInternal(receiver));
  });

  it(`Test pausable`, async function () {
    // Deploy factory
    const { factory } = await setupGiftProtocol();
    const receiver = randomReceiver();
    const claimSigner = new LegacyStarknetKeyPair(`0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`);

    // approvals
    const tokenContract = await manager.tokens.feeTokenContract(false);
    tokenContract.connect(deployer);
    factory.connect(deployer);
    await tokenContract.approve(factory.address, GIFT_AMOUNT + GIFT_MAX_FEE);

    // pause / unpause
    factory.connect(genericAccount);
    await expectRevertWithErrorMessage("Caller is not the owner", () => factory.pause());
    factory.connect(deployer);
    await factory.pause();
    await expectRevertWithErrorMessage("Pausable: paused", () =>
      factory.deposit(tokenContract.address, GIFT_AMOUNT, tokenContract.address, GIFT_MAX_FEE, claimSigner.publicKey),
    );

    await factory.unpause();
    const claim = await defaultDepositTestSetup(factory, false);
    await claim.claimInternal(receiver);

    // Final check
    const dustBalance = await tokenContract.balance_of(claim.claimAddress);
    expect(dustBalance < GIFT_MAX_FEE).to.be.true;
    await tokenContract.balance_of(receiver).should.eventually.equal(GIFT_AMOUNT);
  });
});
