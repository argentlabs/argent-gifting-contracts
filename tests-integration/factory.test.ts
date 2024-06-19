import { expect } from "chai";
import { num } from "starknet";
import {
  LegacyStarknetKeyPair,
  STRK_GIFT_AMOUNT,
  STRK_GIFT_MAX_FEE,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  deposit,
  expectRevertWithErrorMessage,
  genericAccount,
  getMaxFee,
  getMaxGift,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

// First one pass, rest fails
// Ownable can be ignored as uses genericAccount() which is not implemented
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
      const giftAmount = getMaxGift(useTxV3);
      expect(dustBalance < maxFee).to.be.true;
      await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(giftAmount);

      // Test dust
      await manager.tokens.tokenBalance(dustReceiver, claim.gift_token).should.eventually.equal(0n);

      factory.connect(deployer);
      await factory.get_dust(claim, dustReceiver);
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
    await factory.pause();
    await expectRevertWithErrorMessage("Pausable: paused", async () => {
      const { response } = await deposit({
        sender: deployer,
        giftAmount: STRK_GIFT_AMOUNT,
        feeAmount: STRK_GIFT_MAX_FEE,
        factoryAddress: factory.address,
        feeTokenAddress: token.address,
        giftTokenAddress: token.address,
        claimSignerPubKey: claimSigner.publicKey,
      });
      return response;
    });

    await factory.unpause();
    const { claim } = await defaultDepositTestSetup({
      factory,
      overrides: { claimPrivateKey: BigInt(claimSigner.privateKey) },
    });
    await claimInternal({ claim, receiver, claimPrivateKey: claimSigner.privateKey });
  });
  
  describe.only("Ownable", function () {
    it("Pause", async function () {
      const { factory } = await setupGiftProtocol();

      factory.connect(genericAccount());
      await expectRevertWithErrorMessage("Caller is not the owner", () => factory.pause());
    });

    it("Unpause", async function () {
      const { factory } = await setupGiftProtocol();

      factory.connect(deployer);
      await factory.pause();

      factory.connect(genericAccount());
      await expectRevertWithErrorMessage("Caller is not the owner", () => factory.unpause());

      // needed for next tests
      factory.connect(deployer);
      await factory.unpause();
    });

    it("Get Dust", async function () {
      const { factory } = await setupGiftProtocol();
      const { claim } = await defaultDepositTestSetup({ factory });
      const dustReceiver = randomReceiver();

      factory.connect(genericAccount());
      await expectRevertWithErrorMessage("Caller is not the owner", () => factory.get_dust(claim, dustReceiver));
    });
  });
});
