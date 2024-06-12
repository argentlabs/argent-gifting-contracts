import {
  LegacyStarknetKeyPair,
  buildCallDataClaim,
  calculateClaimAddress,
  claimExternal,
  defaultDepositTestSetup,
  deployMockERC20,
  deployer,
  expectRevertWithErrorMessage,
  getClaimExternalData,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Claim External", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing claim_external flow using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
      const receiver = randomReceiver();

      await claimExternal(claim, receiver, claimPrivateKey);
    });
  }

  it(`Invalid Receiver`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = "0x0";

    await expectRevertWithErrorMessage("gift/zero-receiver", () => claimExternal(claim, receiver, claimPrivateKey));
  });

  it(`Cannot call claim external twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    await claimExternal(claim, receiver, claimPrivateKey);
    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimExternal(claim, receiver, claimPrivateKey),
    );
  });

  it(`Invalid Signature`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();
    const signature = ["0x1", "0x2"];

    await expectRevertWithErrorMessage("gift/invalid-ext-signature", () =>
      deployer.execute(factory.populateTransaction.claim_external(buildCallDataClaim(claim), receiver, signature)),
    );
  });

  it(`Invalid factory address`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAddress = calculateClaimAddress(claim);

    claim.factory = "0x2";

    const giftSigner = new LegacyStarknetKeyPair(claimPrivateKey);
    const claimExternalData = await getClaimExternalData({ receiver });
    const signature = await giftSigner.signMessage(claimExternalData, claimAddress);

    await expectRevertWithErrorMessage("gift/invalid-factory-address", () =>
      deployer.execute(factory.populateTransaction.claim_external(buildCallDataClaim(claim), receiver, signature)),
    );
  });

  it(`gift/invalid-class-hash`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    claim.class_hash = "0x1";

    await expectRevertWithErrorMessage("gift/invalid-class-hash", () =>
      claimExternal(claim, receiver, claimPrivateKey),
    );
  });

  it(`Claim gift cancelled`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();
    const claimAddress = calculateClaimAddress(claim);

    const token = await manager.loadContract(claim.gift_token);
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
      claimExternal(claim, receiver, claimPrivateKey),
    );
  });

  it(`Wrong claim pubkey`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAddress = calculateClaimAddress(claim);

    claim.claim_pubkey = 1n;

    await expectRevertWithErrorMessage("gift/invalid-ext-signature", () =>
      claimExternal(claim, receiver, claimPrivateKey, claimAddress),
    );
  });

  it(`Cannot replay signature to claim all tokens`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, false, undefined, mockERC20.address);
    const receiver = randomReceiver();

    const claimAddress = calculateClaimAddress(claim);

    const giftSigner = new LegacyStarknetKeyPair(claimPrivateKey);
    const claimExternalData = await getClaimExternalData({ receiver });
    const signature = await giftSigner.signMessage(claimExternalData, claimAddress);
    await deployer.execute(factory.populateTransaction.claim_external(buildCallDataClaim(claim), receiver, signature));

    claim.gift_token = claim.fee_token;
    await expectRevertWithErrorMessage("gift/invalid-ext-signature", () =>
      deployer.execute(factory.populateTransaction.claim_external(buildCallDataClaim(claim), receiver, signature)),
    );
  });
});
