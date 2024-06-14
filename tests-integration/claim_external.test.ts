import { expect } from "chai";
import { byteArray, uint256 } from "starknet";
import {
  calculateClaimAddress,
  claimExternal,
  defaultDepositTestSetup,
  deployer,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
  signExternalClaim,
} from "../lib";

describe("Claim External", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing claim_external flow using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
      const receiver = randomReceiver();
      const claimAddress = calculateClaimAddress(claim);

      await claimExternal({ claim, receiver, claimPrivateKey });

      const token = await manager.loadContract(claim.gift_token);
      const finalBalance = await token.balance_of(claimAddress);
      expect(finalBalance == claim.fee_amount).to.be.true;
      await token.balance_of(receiver).should.eventually.equal(claim.gift_amount);
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

  it(`Not possible to claim more via reentrancy`, async function () {
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
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, false, 123456n, reentrant.address);

    const claimSig = await signExternalClaim({ claim, receiver, claimPrivateKey });

    reentrant.connect(deployer);
    await reentrant.set_claim_data(claim, receiver, "0x0", claimSig);

    await expectRevertWithErrorMessage("ERC20: insufficient balance", () =>
      claimExternal({ claim, receiver, claimPrivateKey }),
    );
  });
});
