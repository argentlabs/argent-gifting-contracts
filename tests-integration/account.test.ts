import { expect } from "chai";
import { num } from "starknet";
import { deployer, expectRevertWithErrorMessage, manager } from "../lib";
import { GIFT_AMOUNT, GIFT_MAX_FEE, setupClaim } from "./setupClaim";

describe("Gifting", function () {
  let claimAccountClassHash: string;
  before(async () => {
    //  declare claim account
    claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
  });

  for (const useTxV3 of [false, true]) {
    it(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      const { factory, claimAccount, claim, tokenContract, receiver } = await setupClaim(useTxV3);
      await factory.claim_internal(claim, receiver);

      // Final check
      const finalBalance = await tokenContract.balance_of(claimAccount.address);
      expect(finalBalance < GIFT_MAX_FEE).to.be.true;
      await tokenContract.balance_of(receiver).should.eventually.equal(GIFT_AMOUNT);
    });

    it(`Test max fee too high`, async function () {
      const { factory, claimAccount, claim, receiver } = await setupClaim(useTxV3);
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
        await expectRevertWithErrorMessage("gift-acc/insufficient-v3-fee", () =>
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
        await expectRevertWithErrorMessage("gift-acc/insufficient-v1-fee", () =>
          factory.claim_internal(claim, receiver, { maxFee: GIFT_MAX_FEE + 1n }),
        );
      }
    });
  }

  it(`Test basic validation asserts`, async function () {
    const { factory, claimAccount, claim, receiver } = await setupClaim();

    const claimContract = await manager.loadContract(num.toHex(claimAccount.address));

    // only protocol
    claimContract.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/only-protocol", () => claimContract.__validate__([]));

    // cant call another contract
    const fakeFactory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });
    fakeFactory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      fakeFactory.claim_internal(claim, receiver, { maxFee: 400000000000000n }),
    );

    // wrong selector
    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () => factory.get_claim_class_hash());

    // multicall
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
