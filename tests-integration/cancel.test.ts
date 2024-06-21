import {
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployMockERC20,
  deployer,
  expectRevertWithErrorMessage,
  devnetAccount,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

// FILE TESTED SUCCESSFULLY except for "Cancel Claim wrong sender" cause uses devnetAccount() which is not implemented
describe("Cancel Claim", function () {
  it(`Cancel Claim (fee_token == gift_token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const claimAddress = calculateClaimAddress(claim);

    const balanceSenderBefore = await manager.tokens.tokenBalance(deployer.address, claim.gift_token);
    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim);
    await manager.waitForTransaction(transaction_hash);

    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await manager.tokens
      .tokenBalance(deployer.address, claim.gift_token)
      .should.eventually.equal(balanceSenderBefore + claim.gift_amount + claim.fee_amount - txFee);
    // Check balance claim address address == 0
    await manager.tokens.tokenBalance(claimAddress, claim.fee_token).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal({ claim, receiver, claimPrivateKey }),
    );
  });

  it(`Cancel Claim (fee_token != gift_token)`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: mockERC20.address },
    });
    const receiver = randomReceiver();
    const claimAddress = calculateClaimAddress(claim);

    const balanceSenderBeforeGiftToken = await manager.tokens.tokenBalance(deployer.address, claim.gift_token);
    const balanceSenderBeforeFeeToken = await manager.tokens.tokenBalance(deployer.address, claim.fee_token);
    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim);
    await manager.waitForTransaction(transaction_hash);
    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await manager.tokens
      .tokenBalance(deployer.address, claim.gift_token)
      .should.eventually.equal(balanceSenderBeforeGiftToken + claim.gift_amount);
    await manager.tokens
      .tokenBalance(deployer.address, claim.fee_token)
      .should.eventually.equal(balanceSenderBeforeFeeToken + claim.fee_amount - txFee);
    // Check balance claim address address == 0
    await manager.tokens.tokenBalance(claimAddress, claim.gift_token).should.eventually.equal(0n);
    await manager.tokens.tokenBalance(claimAddress, claim.fee_token).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal({ claim, receiver, claimPrivateKey }),
    );
  });

  it(`Cancel Claim wrong sender`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup({ factory });

    factory.connect(devnetAccount());
    await expectRevertWithErrorMessage("gift/wrong-sender", () => factory.cancel(claim));
  });

  it(`Cancel Claim: owner reclaim dust (gift_token == fee_token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    const { transaction_hash: transaction_hash_claim } = await claimInternal({ claim, receiver, claimPrivateKey });
    const txFeeCancelClaim = BigInt((await manager.getTransactionReceipt(transaction_hash_claim)).actual_fee.amount);

    const claimAddress = calculateClaimAddress(claim);

    const balanceSenderBefore = await manager.tokens.tokenBalance(deployer.address, claim.gift_token);
    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim);
    await manager.waitForTransaction(transaction_hash);
    const txFeeCancel = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await manager.tokens
      .tokenBalance(deployer.address, claim.gift_token)
      .should.eventually.equal(balanceSenderBefore + claim.fee_amount - txFeeCancel - txFeeCancelClaim);
    // Check balance claim address address == 0
    await manager.tokens.tokenBalance(claimAddress, claim.gift_token).should.eventually.equal(0n);
  });

  it(`Cancel Claim: gift/already-claimed (gift_token != fee_token)`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: mockERC20.address },
    });
    const receiver = randomReceiver();

    const { transaction_hash } = await claimInternal({ claim, receiver, claimPrivateKey });
    await manager.waitForTransaction(transaction_hash);
    factory.connect(deployer);
    await expectRevertWithErrorMessage("gift/already-claimed", () => factory.cancel(claim));
  });
});
