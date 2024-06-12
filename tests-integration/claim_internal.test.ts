import { expect } from "chai";
import { byteArray, num, uint256 } from "starknet";
import {
  GIFT_MAX_FEE,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Claim Internal", function () {
  for (const useTxV3 of [false, true]) {
    it(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, useTxV3);
      const receiver = randomReceiver();
      const claimAddress = calculateClaimAddress(claim);

      await claimInternal(claim, receiver, claimPrivateKey);

      const token = await manager.loadContract(claim.gift_token);
      const finalBalance = await token.balance_of(claimAddress);
      expect(finalBalance < claim.fee_amount).to.be.true;
      await token.balance_of(receiver).should.eventually.equal(claim.gift_amount);
    });

    it(`Test max fee too high using txV3: ${useTxV3}`, async function () {
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, useTxV3);
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
          claimInternal(claim, receiver, claimPrivateKey, { resourceBounds: newResourceBounds, tip: 1 }),
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

  it(`Call claim internal twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    await claimInternal(claim, receiver, claimPrivateKey);
    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () =>
      claimInternal(claim, receiver, claimPrivateKey),
    );
  });

  it(`Not possible to re-enter claim internal`, async function () {
    const { factory } = await setupGiftProtocol();
    const reentrant = await manager.deployContract("ReentrantERC20", {
      unique: true,
      constructorCalldata: [
        byteArray.byteArrayFromString("USDC"),
        byteArray.byteArrayFromString("USDC"),
        uint256.bnToUint256(100e18),
        deployer.address,
        factory.address,
      ],
    });
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, false, 123456n, reentrant.address);
    const receiver = "0x9999";

    await expectRevertWithErrorMessage("gift/only-claim-account", () =>
      claimInternal(claim, receiver, claimPrivateKey),
    );
  });
});