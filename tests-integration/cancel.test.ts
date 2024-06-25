import {
  calculateClaimAddress,
  cancelGift,
  claimInternal,
  defaultDepositTestSetup,
  deployMockERC20,
  deployer,
  devnetAccount,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Cancel Claim", function () {
  it(`Cancel Claim (fee_token == gift_token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const claimAddress = calculateClaimAddress(claim);

    const balanceSenderBefore = await manager.tokens.tokenBalance(deployer.address, claim.gift_token);

    const { transaction_hash } = await cancelGift({ claim });

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
    const { transaction_hash } = await cancelGift({ claim });

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
    await expectRevertWithErrorMessage("gift/wrong-sender", () =>
      cancelGift({ claim, senderAccount: devnetAccount() }),
    );
  });

  it(`Cancel Claim: owner reclaim dust (gift_token == fee_token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    const { transaction_hash: transaction_hash_claim } = await claimInternal({ claim, receiver, claimPrivateKey });
    const txFeeCancelClaim = BigInt((await manager.getTransactionReceipt(transaction_hash_claim)).actual_fee.amount);

    const claimAddress = calculateClaimAddress(claim);

    const balanceSenderBefore = await manager.tokens.tokenBalance(deployer.address, claim.gift_token);
    const { transaction_hash } = await cancelGift({ claim });

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

    await claimInternal({ claim, receiver, claimPrivateKey });
    await expectRevertWithErrorMessage("gift/already-claimed", () => cancelGift({ claim }));
  });
});
