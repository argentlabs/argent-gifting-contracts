import { expect } from "chai";
import { num } from "starknet";
import {
  GIFT_AMOUNT,
  GIFT_MAX_FEE,
  deployer,
  expectRevertWithErrorMessage,
  manager,
  setupGift,
  setupGiftProtocol,
} from "../lib";

describe("Gifting", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      const { factory, claimAccountClassHash } = await setupGiftProtocol();
      const { claimAccount, claim, tokenContract, receiver } = await setupGift(factory, claimAccountClassHash, useTxV3);
      await factory.claim_internal(claim, receiver);

      const finalBalance = await tokenContract.balance_of(claimAccount.address);
      expect(finalBalance < GIFT_MAX_FEE).to.be.true;
      await tokenContract.balance_of(receiver).should.eventually.equal(GIFT_AMOUNT);
    });

    it(`Test max fee too high`, async function () {
      const { factory, claimAccountClassHash } = await setupGiftProtocol();
      const { claimAccount, claim, receiver } = await setupGift(factory, claimAccountClassHash, useTxV3);
      if (useTxV3) {
        const estimate = await factory.estimateFee.claim_internal(claim, receiver);
        const newResourceBounds = {
          ...estimate.resourceBounds,
          l2_gas: {
            ...estimate.resourceBounds.l2_gas,
            max_amount: GIFT_MAX_FEE + 1n,
            max_price_per_unit: num.toHexString(4),
          },
        };
        await expectRevertWithErrorMessage("gift-acc/max-fee-too-high-v3", () =>
          claimAccount.execute(
            [
              {
                contractAddress: factory.address,
                calldata: [claim, receiver],
                entrypoint: "claim_internal",
              },
            ],
            undefined,
            { resourceBounds: newResourceBounds, tip: 1 },
          ),
        );
      } else {
        await expectRevertWithErrorMessage("gift-acc/max-fee-too-high-v1", () =>
          factory.claim_internal(claim, receiver, { maxFee: GIFT_MAX_FEE + 1n }),
        );
      }
    });
  }

  it(`Test only protocol can call claim contract`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claimAccount, claim, receiver } = await setupGift(factory, claimAccountClassHash);
    const claimContract = await manager.loadContract(num.toHex(claimAccount.address));

    claimContract.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/only-protocol", () => claimContract.__validate__([]));
  });

  it(`Test claim contract cant call another contract`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claimAccount, claim, receiver } = await setupGift(factory, claimAccountClassHash);

    const fakeFactory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });
    fakeFactory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      fakeFactory.claim_internal(claim, receiver, { maxFee: 400000000000000n }),
    );
  });

  it(`Test claim contract can only call 'claim_internal'`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claimAccount, claim, receiver } = await setupGift(factory, claimAccountClassHash);

    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () =>
      factory.get_dust(claim, receiver, { maxFee: 400000000000000n }),
    );
  });

  it(`Test claim contract cant preform a multicall`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claimAccount, claim, receiver } = await setupGift(factory, claimAccountClassHash);

    await expectRevertWithErrorMessage("gift-acc/invalid-call-len", () =>
      claimAccount.execute([
        {
          contractAddress: factory.address,
          calldata: [claim, receiver],
          entrypoint: "claim_internal",
        },
        {
          contractAddress: factory.address,
          calldata: [claim, receiver],
          entrypoint: "claim_internal",
        },
      ]),
    );
  });

  it(`Test cannot call 'claim_internal' twice`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claimAccount, claim, receiver } = await setupGift(factory, claimAccountClassHash);

    // double claim
    await factory.claim_internal(claim, receiver);
    await expectRevertWithErrorMessage("gift-acc/invalid-claim-nonce", () =>
      claimAccount.execute(
        [
          {
            contractAddress: factory.address,
            calldata: [claim, receiver],
            entrypoint: "claim_internal",
          },
        ],
        undefined,
        { skipValidate: false },
      ),
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
