import { expect } from "chai";
import { Account, RPC, num } from "starknet";
import {
  GIFT_MAX_FEE,
  buildCallDataClaim,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Gifting", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
      const receiver = randomReceiver();
      await claimInternal(claim, receiver, claimPrivateKey);

      const claimAddress = calculateClaimAddress(claim);

      const token = await manager.loadContract(claim.token);
      const finalBalance = await token.balance_of(claimAddress);
      expect(finalBalance < claim.max_fee).to.be.true;
      await token.balance_of(receiver).should.eventually.equal(claim.amount);
    });

    it(`Test max fee too high using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
      const receiver = randomReceiver();
      if (useTxV3) {
        const newResourceBounds = {
          l2_gas: {
            max_amount: num.toHexString(GIFT_MAX_FEE * 1000n),
            max_price_per_unit: num.toHexString(10),
          },
          l1_gas: {
            max_amount: num.toHexString(GIFT_MAX_FEE * 1000n),
            max_price_per_unit: num.toHexString(10),
          },
          tip: 1,
        };
        await expectRevertWithErrorMessage("gift-acc/max-fee-too-high-v3", () =>
          claimInternal(claim, receiver, claimPrivateKey, { resourceBounds: newResourceBounds }),
        );
      } else {
        await expectRevertWithErrorMessage("gift-acc/max-fee-too-high-v1", () =>
          claimInternal(claim, receiver, claimPrivateKey, {
            maxFee: GIFT_MAX_FEE + 1n,
          }),
        );
      }
    });
  }

  it(`Test only protocol can call claim contract`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);

    const claimAddress = calculateClaimAddress(claim);

    const claimAccount = new Account(
      manager,
      num.toHex(claimAddress),
      claimPrivateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );
    const claimContract = await manager.loadContract(claimAddress);
    claimContract.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/only-protocol", () => claimContract.__validate__([]));
  });

  // it.only(`Test claim contract cant call another contract`, async function () {
  //   const { factory, claimAccountClassHash } = await setupGiftProtocol();
  //   const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
  //   const receiver = randomReceiver();

  //   const fakeFactory = await manager.deployContract("GiftFactory", {
  //     unique: true,
  //     constructorCalldata: [claimAccountClassHash, deployer.address],
  //   });

  //   const fakeClaim = { ...claim, factory: fakeFactory.address };
  //   const claimAddress = calculateClaimAddress(claim);

  //   const claimAccount = new Account(
  //     manager,
  //     num.toHex(claimAddress),
  //     claimPrivateKey,
  //     undefined,
  //     RPC.ETransactionVersion.V2,
  //   );
  //   fakeFactory.connect(claimAccount);
  //   await fakeFactory.claim_internal(buildCallDataClaim(fakeClaim), receiver, { maxFee: 400000000000000n });

  //   // await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
  //   //   claimInternal(fakeClaim, receiver, claimPrivateKey),
  //   // );
  // });

  it(`Test claim contract can only call 'claim_internal'`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAddress = calculateClaimAddress(claim);

    const claimAccount = new Account(
      manager,
      num.toHex(claimAddress),
      claimPrivateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );

    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () =>
      factory.get_dust(claim, receiver, { maxFee: 400000000000000n }),
    );
  });

  it(`Test claim contract cant preform a multicall`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAddress = calculateClaimAddress(claim);

    const claimAccount = new Account(
      manager,
      num.toHex(claimAddress),
      claimPrivateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );

    await expectRevertWithErrorMessage("gift-acc/invalid-call-len", () =>
      claimAccount.execute([
        {
          contractAddress: factory.address,
          calldata: [buildCallDataClaim(claim), receiver],
          entrypoint: "claim_internal",
        },
        {
          contractAddress: factory.address,
          calldata: [buildCallDataClaim(claim), receiver],
          entrypoint: "claim_internal",
        },
      ]),
    );
  });

  it(`Test cannot call 'claim_internal' twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    // double claim
    await claimInternal(claim, receiver, claimPrivateKey);
    await expectRevertWithErrorMessage("gift-acc/invalid-claim-nonce", () =>
      claimInternal(claim, receiver, claimPrivateKey, { skipValidate: false }),
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
