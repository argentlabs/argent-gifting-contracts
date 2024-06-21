import { expect } from "chai";
import { num, RPC } from "starknet";
import {
  calculateClaimAddress,
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

// FILE TESTED SUCCESSFULLY
// Ownable can be ignored as uses devnetAccount() which is not implemented
describe("Test Core Factory Functions", function () {
  it(`Calculate claim address`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup({ factory });

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
      const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, useTxV3 });
      const receiver = randomReceiver();
      const dustReceiver = randomReceiver();

      await claimInternal({ claim, receiver, claimPrivateKey });
      const claimAddress = calculateClaimAddress(claim);

      // Final check
      const dustBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      const maxFee = getMaxFee(useTxV3);
      const giftAmount = getGiftAmount(useTxV3);
      expect(dustBalance < maxFee).to.be.true;
      await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(giftAmount);

      // Test dust
      await manager.tokens.tokenBalance(dustReceiver, claim.gift_token).should.eventually.equal(0n);

      factory.connect(deployer);
      const { transaction_hash } = await factory.get_dust(claim, dustReceiver);
      await manager.waitForTransaction(transaction_hash);
      await manager.tokens.tokenBalance(claimAddress, claim.gift_token).should.eventually.equal(0n);
      await manager.tokens.tokenBalance(dustReceiver, claim.gift_token).should.eventually.equal(dustBalance);
    });
  }

  it(`Pausable`, async function () {
    // Deploy factory
    const { factory } = await setupGiftProtocol();
    const receiver = randomReceiver();
    const claimSigner = new LegacyStarknetKeyPair();

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
        claimSignerPubKey: claimSigner.publicKey,
      });
      return response;
    });

    const { transaction_hash: txHash2 } = await factory.unpause();
    await manager.waitForTransaction(txHash2);
    const { claim } = await defaultDepositTestSetup({
      factory,
      overrides: { claimPrivateKey: BigInt(claimSigner.privateKey) },
    });
    const { execution_status } = await claimInternal({
      claim,
      receiver,
      claimPrivateKey: claimSigner.privateKey,
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

    it("Get Dust", async function () {
      const { factory } = await setupGiftProtocol();
      const { claim } = await defaultDepositTestSetup({ factory });
      const dustReceiver = randomReceiver();

      factory.connect(devnetAccount());
      await expectRevertWithErrorMessage("Caller is not the owner", () => factory.get_dust(claim, dustReceiver));
    });
  });
});
