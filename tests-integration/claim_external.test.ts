import { expect } from "chai";
import { byteArray, uint256 } from "starknet";
import {
  calculateClaimAddress,
  cancelGift,
  claimExternal,
  defaultDepositTestSetup,
  deployMockERC20,
  deployer,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
  signExternalClaim,
} from "../lib";

describe("Claim External", function () {
  for (const useTxV3 of [false, true]) {
    it(`gift_token == fee_token flow using txV3: ${useTxV3} (no dust receiver)`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
      const receiver = randomReceiver();
      const claimAddress = calculateClaimAddress(claim);

      await claimExternal({ claim, receiver, claimPrivateKey });

      const finalBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(finalBalance).to.equal(claim.fee_amount);
      await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(claim.gift_amount);
      await manager.tokens.tokenBalance(claimAddress, claim.fee_token).should.eventually.equal(claim.fee_amount);
    });

    it(`gift_token == fee_token flow using txV3: ${useTxV3}  (w/ dust receiver)`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
      const receiver = randomReceiver();
      const dustReceiver = randomReceiver();
      const claimAddress = calculateClaimAddress(claim);

      const balanceBefore = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      await claimExternal({ claim, receiver, claimPrivateKey, dustReceiver });

      await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(claim.gift_amount);
      await manager.tokens
        .tokenBalance(dustReceiver, claim.gift_token)
        .should.eventually.equal(balanceBefore - claim.gift_amount);
      await manager.tokens.tokenBalance(claimAddress, claim.gift_token).should.eventually.equal(0n);
      await manager.tokens.tokenBalance(claimAddress, claim.fee_token).should.eventually.equal(0n);
    });
  }

  it(`gift_token != fee_token (w/ dust receiver)`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftToken = await deployMockERC20();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: giftToken.address },
    });
    const receiver = randomReceiver();
    const dustReceiver = randomReceiver();
    const claimAddress = calculateClaimAddress(claim);

    await claimExternal({ claim, receiver, claimPrivateKey, dustReceiver });

    await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(claim.gift_amount);
    await manager.tokens.tokenBalance(dustReceiver, claim.fee_token).should.eventually.equal(claim.fee_amount);
    await manager.tokens.tokenBalance(claimAddress, claim.gift_token).should.eventually.equal(0n);
    await manager.tokens.tokenBalance(claimAddress, claim.fee_token).should.eventually.equal(0n);
  });

  it(`gift_token != fee_token (no dust receiver)`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftToken = await deployMockERC20();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: giftToken.address },
    });
    const receiver = randomReceiver();
    const claimAddress = calculateClaimAddress(claim);

    await claimExternal({ claim, receiver, claimPrivateKey });

    await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(claim.gift_amount);
    await manager.tokens.tokenBalance(claimAddress, claim.gift_token).should.eventually.equal(0n);
    await manager.tokens.tokenBalance(claimAddress, claim.fee_token).should.eventually.equal(claim.fee_amount);
  });

  it(`Zero Receiver`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = "0x0";

    await expectRevertWithErrorMessage("gift/zero-receiver", () => claimExternal({ claim, receiver, claimPrivateKey }));
  });

  it(`Cannot call claim external twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimExternal({ claim, receiver, claimPrivateKey });
    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimExternal({ claim, receiver, claimPrivateKey }),
    );
  });

  it(`Invalid Signature`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    await expectRevertWithErrorMessage("gift/invalid-ext-signature", () =>
      claimExternal({ claim, receiver, claimPrivateKey: "0x1234" }),
    );
  });

  it(`Claim gift cancelled`, async function () {
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
    await manager.tokens.tokenBalance(claimAddress, claim.gift_token).should.eventually.equal(0n);

    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimExternal({ claim, receiver, claimPrivateKey }),
    );
  });

  it.skip(`Not possible to claim more via reentrancy`, async function () {
    const { factory } = await setupGiftProtocol();
    const receiver = randomReceiver();

    const reentrant = await manager.deployContract("ReentrantERC20", {
      unique: true,
      constructorCalldata: [
        byteArray.byteArrayFromString("ReentrantUSDC"),
        byteArray.byteArrayFromString("RUSDC"),
        uint256.bnToUint256(100e18),
        deployer.address,
        factory.address,
      ],
    });
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: reentrant.address },
    });

    const claimSig = await signExternalClaim({ claim, receiver, claimPrivateKey });

    reentrant.connect(deployer);
    const { transaction_hash } = await reentrant.set_claim_data(claim, receiver, "0x0", claimSig);
    await manager.waitForTransaction(transaction_hash);

    await expectRevertWithErrorMessage("ERC20: insufficient balance", () =>
      claimExternal({ claim, receiver, claimPrivateKey }),
    );
  });
});
