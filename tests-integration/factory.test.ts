import { expect } from "chai";
import { num } from "starknet";
import {
  GIFT_AMOUNT,
  LegacyStarknetKeyPair,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  deposit,
  expectRevertWithErrorMessage,
  genericAccount,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";
import { GIFT_MAX_FEE } from "./../lib";

describe("Test Core Factory Functions", function () {
  it(`Calculate claim address`, async function () {
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
      const dustReceiver = randomReceiver();

      await claimInternal({ claim, receiver, claimPrivateKey });
      const claimAddress = calculateClaimAddress(claim);

      // Final check
      const dustBalance = await manager.tokens.tokenBalance(claimAddress, claim.gift_token);
      expect(dustBalance < GIFT_MAX_FEE).to.be.true;
      await manager.tokens.tokenBalance(receiver, claim.gift_token).should.eventually.equal(GIFT_AMOUNT);

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
        giftAmount: GIFT_AMOUNT,
        feeAmount: GIFT_MAX_FEE,
        factoryAddress: factory.address,
        feeTokenAddress: token.address,
        giftTokenAddress: token.address,
        claimSignerPubKey: claimSigner.publicKey,
      });
      return response;
    });

    await factory.unpause();
    const { claim } = await defaultDepositTestSetup(factory, false, BigInt(claimSigner.privateKey));
    await claimInternal({ claim, receiver, claimPrivateKey: claimSigner.privateKey });
  });

  it("Ownable: Pause", async function () {
    const { factory } = await setupGiftProtocol();

    factory.connect(genericAccount);
    await expectRevertWithErrorMessage("Caller is not the owner", () => factory.pause());
  });

  it("Ownable: Unpause", async function () {
    const { factory } = await setupGiftProtocol();

    factory.connect(deployer);
    await factory.pause();

    factory.connect(genericAccount);
    await expectRevertWithErrorMessage("Caller is not the owner", () => factory.unpause());

    // needed for next tests
    factory.connect(deployer);
    await factory.unpause();
  });

  it("Ownable: Get Dust", async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup(factory);
    const dustReceiver = randomReceiver();

    factory.connect(genericAccount);
    await expectRevertWithErrorMessage("Caller is not the owner", () => factory.get_dust(claim, dustReceiver));
  });
});
