import { expect } from "chai";
import { Account, RPC, num } from "starknet";
import {
  GIFT_MAX_FEE,
  defaultDepositTestSetup,
  deployer,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Gifting", function () {
  for (const useTxV3 of [true, false]) {
    it(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const claim = await defaultDepositTestSetup(factory, useTxV3);
      const receiver = randomReceiver();
      const claimAddress = claim.claimAddress;

      await claim.claimInternal(receiver);

      const token = await manager.loadContract(claim.giftToken);
      const finalBalance = await token.balance_of(claimAddress);
      expect(finalBalance < claim.feeAmount).to.be.true;
      await token.balance_of(receiver).should.eventually.equal(claim.giftAmount);
    });

    it(`Test max fee too high using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const claim = await defaultDepositTestSetup(factory, useTxV3);
      const receiver = randomReceiver();
      if (useTxV3) {
        const newResourceBounds = {
          l2_gas: {
            max_amount: num.toHexString(GIFT_MAX_FEE),
            max_price_per_unit: num.toHexString(1),
          },
          l1_gas: {
            max_amount: num.toHexString(10),
            max_price_per_unit: num.toHexString(36000000000n), // Current devnet gas price
          },
        };
        await expectRevertWithErrorMessage("gift-acc/max-fee-too-high-v3", () =>
          claim.claimInternal(receiver, { resourceBounds: newResourceBounds, tip: 1 }),
        );
      } else {
        await expectRevertWithErrorMessage("gift-acc/max-fee-too-high-v1", () =>
          claim.claimInternal(receiver, {
            maxFee: GIFT_MAX_FEE + 1n,
          }),
        );
      }
    });
  }

  it(`Test only protocol can call claim contract`, async function () {
    const { factory } = await setupGiftProtocol();
    const claim = await defaultDepositTestSetup(factory);

    const claimAccount = new Account(
      manager,
      claim.claimAddress,
      claim.signer.privateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );
    const claimContract = await manager.loadContract(claim.claimAddress);
    claimContract.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/only-protocol", () => claimContract.__validate__([]));
  });

  it(`Test claim contract cant call another contract`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const claim = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const fakeFactory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });

    const claimAccount = new Account(
      manager,
      claim.claimAddress,
      claim.signer.privateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );
    fakeFactory.connect(claimAccount);

    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      fakeFactory.claim_internal(claim.callDataClaim, receiver, { maxFee: 400000000000000n }),
    );
  });

  it(`Test claim contract can only call 'claim_internal'`, async function () {
    const { factory } = await setupGiftProtocol();
    const claim = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAccount = new Account(
      manager,
      claim.claimAddress,
      claim.signer.privateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );

    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () =>
      factory.get_dust(claim.callDataClaim, receiver, { maxFee: 400000000000000n }),
    );
  });

  it(`Test claim contract cant preform a multicall`, async function () {
    const { factory } = await setupGiftProtocol();
    const claim = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAccount = new Account(
      manager,
      claim.claimAddress,
      claim.signer.privateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );

    await expectRevertWithErrorMessage("gift-acc/invalid-call-len", () =>
      claimAccount.execute([
        {
          contractAddress: factory.address,
          calldata: [claim.callDataClaim, receiver],
          entrypoint: "claim_internal",
        },
        {
          contractAddress: factory.address,
          calldata: [claim.callDataClaim, receiver],
          entrypoint: "claim_internal",
        },
      ]),
    );
  });

  it(`Test cannot call 'claim_internal' twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const claim = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    // double claim
    await claim.claimInternal(receiver);
    await expectRevertWithErrorMessage("gift-acc/invalid-claim-nonce", () =>
      claim.claimInternal(receiver, { skipValidate: false }),
    );
  });
  // TODO Tests:
  // - claim_external
  // - check with wrong claim data
  // - claim without enough fee to full-fill execution
  // - cancel
  // - get_dust
  // - All validate branches
  // - What if ERC20 reverts? (check every fn with that)
});
