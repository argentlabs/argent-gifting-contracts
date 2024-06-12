import { expect } from "chai";
import { ec, encode, num } from "starknet";
import {
  GIFT_AMOUNT,
  GIFT_MAX_FEE,
  LegacyStarknetKeyPair,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployMockERC20,
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
    const { claim } = await defaultDepositTestSetup(factory);

    const claimAddress = await factory.get_claim_address(
      claim.class_hash,
      deployer.address,
      claim.gift_token,
      claim.gift_amount,
      claim.fee_token,
      claim.fee_amount,
      claim.claim_pubkey,
    );

    const correctAddress = calculateClaimAddress(claim);
    expect(claimAddress).to.be.equal(num.toBigInt(correctAddress));
  });
  for (const useTxV3 of [false, true]) {
    it(`get_dust: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
      const receiver = randomReceiver();
      const receiverDust = randomReceiver();

      await claimInternal(claim, receiver, claimPrivateKey);
      const claimAddress = calculateClaimAddress(claim);
      const token = await manager.loadContract(claim.gift_token);

      // Final check

      const dustBalance = await token.balance_of(claimAddress);
      expect(dustBalance < GIFT_MAX_FEE).to.be.true;
      await token.balance_of(receiver).should.eventually.equal(GIFT_AMOUNT);

      // Test dust
      await token.balance_of(receiverDust).should.eventually.equal(0n);

      factory.connect(deployer);
      await factory.get_dust(claim, receiverDust);
      await token.balance_of(claimAddress).should.eventually.equal(0n);
      await token.balance_of(receiverDust).should.eventually.equal(dustBalance);
    });
  }

  it(`Cancel Claim (fee_token == gift_token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();
    const token = await manager.loadContract(claim.gift_token);
    const claimAddress = calculateClaimAddress(claim);

    const balanceSenderBefore = await token.balance_of(deployer.address);
    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim);
    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await token
      .balance_of(deployer.address)
      .should.eventually.equal(balanceSenderBefore + claim.gift_amount + claim.fee_amount - txFee);
    // Check balance claim address address == 0
    await token.balance_of(claimAddress).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal(claim, receiver, claimPrivateKey),
    );
  });

  it(`Cancel Claim (fee_token != gift_token)`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, false, undefined, mockERC20.address);
    const receiver = randomReceiver();
    const gifToken = await manager.loadContract(claim.gift_token);
    const feeToken = await manager.loadContract(claim.fee_token);
    const claimAddress = calculateClaimAddress(claim);

    const balanceSenderBeforeGiftToken = await gifToken.balance_of(deployer.address);
    const balanceSenderBeforeFeeToken = await feeToken.balance_of(deployer.address);
    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim);
    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await gifToken
      .balance_of(deployer.address)
      .should.eventually.equal(balanceSenderBeforeGiftToken + claim.gift_amount);
    await feeToken
      .balance_of(deployer.address)
      .should.eventually.equal(balanceSenderBeforeFeeToken + claim.fee_amount - txFee);
    // Check balance claim address address == 0
    await gifToken.balance_of(claimAddress).should.eventually.equal(0n);
    await feeToken.balance_of(claimAddress).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal(claim, receiver, claimPrivateKey),
    );
  });

  it(`Cancel Claim wrong sender`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup(factory);

    factory.connect(genericAccount);
    await expectRevertWithErrorMessage("gift/wrong-sender", () => factory.cancel(claim));
  });

  it(`Cancel Claim: owner reclaim dust (gift_token == fee_token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();
    const token = await manager.loadContract(claim.gift_token);

    const { transaction_hash: transaction_hash_claim } = await claimInternal(claim, receiver, claimPrivateKey);
    const txFeeCancelClaim = BigInt((await manager.getTransactionReceipt(transaction_hash_claim)).actual_fee.amount);

    const claimAddress = calculateClaimAddress(claim);

    const balanceSenderBefore = await token.balance_of(deployer.address);
    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim);
    const txFeeCancel = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await token
      .balance_of(deployer.address)
      .should.eventually.equal(balanceSenderBefore + claim.fee_amount - txFeeCancel - txFeeCancelClaim);
    // Check balance claim address address == 0
    await token.balance_of(claimAddress).should.eventually.equal(0n);
  });

  it(`Cancel Claim: gift/already-claimed (gift_token != fee_token)`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, false, undefined, mockERC20.address);
    const receiver = randomReceiver();

    await claimInternal(claim, receiver, claimPrivateKey);
    factory.connect(deployer);
    await expectRevertWithErrorMessage("gift/already-claimed", () => factory.cancel(claim));
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
    const { claim } = await defaultDepositTestSetup(factory, false, BigInt(claimSigner.privateKey));
    await claimInternal(claim, receiver, claimSigner.privateKey);

    // Final check
    const claimAddress = calculateClaimAddress(claim);
    const dustBalance = await tokenContract.balance_of(claimAddress);
    expect(dustBalance < GIFT_MAX_FEE).to.be.true;
    await tokenContract.balance_of(receiver).should.eventually.equal(GIFT_AMOUNT);
  });
});
