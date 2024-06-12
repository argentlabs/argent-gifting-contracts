import {
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

describe("Cancel Claim", function () {
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
});

//upgrade test
