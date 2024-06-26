import {
  calculateEscrowAddress,
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
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const claimAddress = calculateEscrowAddress(gift);

    const balanceSenderBefore = await manager.tokens.tokenBalance(deployer.address, gift.gift_token);

    const { transaction_hash } = await cancelGift({ gift: gift });

    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await manager.tokens
      .tokenBalance(deployer.address, gift.gift_token)
      .should.eventually.equal(balanceSenderBefore + gift.gift_amount + gift.fee_amount - txFee);
    // Check balance gift address address == 0
    await manager.tokens.tokenBalance(claimAddress, gift.fee_token).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal({ gift: gift, receiver, giftPrivateKey: giftPrivateKey }),
    );
  });

  it(`Cancel Claim (fee_token != gift_token)`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: mockERC20.address },
    });
    const receiver = randomReceiver();
    const claimAddress = calculateEscrowAddress(gift);

    const balanceSenderBeforeGiftToken = await manager.tokens.tokenBalance(deployer.address, gift.gift_token);
    const balanceSenderBeforeFeeToken = await manager.tokens.tokenBalance(deployer.address, gift.fee_token);
    const { transaction_hash } = await cancelGift({ gift: gift });

    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await manager.tokens
      .tokenBalance(deployer.address, gift.gift_token)
      .should.eventually.equal(balanceSenderBeforeGiftToken + gift.gift_amount);
    await manager.tokens
      .tokenBalance(deployer.address, gift.fee_token)
      .should.eventually.equal(balanceSenderBeforeFeeToken + gift.fee_amount - txFee);
    // Check balance gift address address == 0
    await manager.tokens.tokenBalance(claimAddress, gift.gift_token).should.eventually.equal(0n);
    await manager.tokens.tokenBalance(claimAddress, gift.fee_token).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal({ gift: gift, receiver, giftPrivateKey: giftPrivateKey }),
    );
  });

  it(`Cancel Claim wrong sender`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift } = await defaultDepositTestSetup({ factory });
    await expectRevertWithErrorMessage("gift/wrong-sender", () =>
      cancelGift({ gift: gift, senderAccount: devnetAccount() }),
    );
  });

  it(`Cancel Claim: owner reclaim dust (gift_token == fee_token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    const { transaction_hash: transaction_hash_claim } = await claimInternal({
      gift: gift,
      receiver,
      giftPrivateKey: giftPrivateKey,
    });
    const txFeeCancelClaim = BigInt((await manager.getTransactionReceipt(transaction_hash_claim)).actual_fee.amount);

    const claimAddress = calculateEscrowAddress(gift);

    const balanceSenderBefore = await manager.tokens.tokenBalance(deployer.address, gift.gift_token);
    const { transaction_hash } = await cancelGift({ gift: gift });

    const txFeeCancel = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await manager.tokens
      .tokenBalance(deployer.address, gift.gift_token)
      .should.eventually.equal(balanceSenderBefore + gift.fee_amount - txFeeCancel - txFeeCancelClaim);
    // Check balance gift address address == 0
    await manager.tokens.tokenBalance(claimAddress, gift.gift_token).should.eventually.equal(0n);
  });

  it(`Cancel Claim: gift/already-claimed (gift_token != fee_token)`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: mockERC20.address },
    });
    const receiver = randomReceiver();

    await claimInternal({ gift: gift, receiver, giftPrivateKey: giftPrivateKey });
    await expectRevertWithErrorMessage("gift/already-claimed", () => cancelGift({ gift: gift }));
  });
});
