import {
  calculateClaimAddress,
  claimExternal,
  defaultDepositTestSetup,
  deployer,
  expectRevertWithErrorMessage,
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

      await claimExternal({ claim, receiver, claimPrivateKey });
    });
  }

  it(`Invalid Receiver`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = "0x0";

    await expectRevertWithErrorMessage("gift/zero-receiver", () => claimExternal({ claim, receiver, claimPrivateKey }));
  });

  it(`Cannot call claim external twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    await claimExternal({ claim, receiver, claimPrivateKey });
    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimExternal({ claim, receiver, claimPrivateKey }),
    );
  });

  it(`Invalid Signature`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    await expectRevertWithErrorMessage("gift/invalid-ext-signature", () =>
      claimExternal({ claim, receiver, claimPrivateKey: "0x1234" }),
    );
  });

  it(`Invalid factory address`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    claim.factory = "0x2";

    await expectRevertWithErrorMessage("gift/invalid-factory-address", () =>
      claimExternal({ claim, receiver, claimPrivateKey, overrides: { factoryAddress: factory.address } }),
    );
  });

  it(`gift/invalid-class-hash`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    claim.class_hash = "0x1";

    await expectRevertWithErrorMessage("gift/invalid-class-hash", () =>
      claimExternal({ claim, receiver, claimPrivateKey }),
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
      claimExternal({ claim, receiver, claimPrivateKey }),
    );
  });

  it(`Wrong claim pubkey`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAddress = calculateClaimAddress(claim);

    claim.claim_pubkey = 1n;

    await expectRevertWithErrorMessage("gift/invalid-ext-signature", () =>
      claimExternal({ claim, receiver, claimPrivateKey, overrides: { claimAccountAddress: claimAddress } }),
    );
  });
});
