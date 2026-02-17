import { expect } from "chai";
import type { Erc20Contract } from "starknet-dev-toolkit";
import { expectRevertWithErrorMessage, manager } from "starknet-dev-toolkit";
import { randomReceiver } from "../lib/claim.js";
import { defaultDepositTestSetup } from "../lib/deposit.js";
import { deployMockERC20, setupGiftProtocol } from "../lib/protocol.js";

describe("Deposit", function () {
  it(`Double deposit`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftPrivateKey = BigInt(randomReceiver());
    const data = { factory, overrides: { giftPrivateKey } };
    await defaultDepositTestSetup(data);
    try {
      await defaultDepositTestSetup(data);
    } catch (e: unknown) {
      if (e instanceof Error) {
        expect(e.toString()).to.include("Deployment failed: contract already deployed at address 0x");
      }
    }
  });

  it(`Deposit works (gift token == fee token)`, async function () {
    const { factory } = await setupGiftProtocol();

    const { gift } = await defaultDepositTestSetup({ factory });

    const escrowAddress = gift.escrowAddress();

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    expect(await giftToken.balance_of(escrowAddress)).to.equal(gift.giftAmount + gift.feeAmount);
  });

  it(`Deposit works with 0 fee amount set (gift token == fee token)`, async function () {
    const { factory } = await setupGiftProtocol();

    const { gift } = await defaultDepositTestSetup({
      factory,
      overrides: { giftAmount: 100n, feeAmount: 0n },
    });

    const escrowAddress = gift.escrowAddress();

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    expect(await giftToken.balance_of(escrowAddress)).to.equal(gift.giftAmount + gift.feeAmount);
  });

  it(`Deposit works with 0 fee amount set (gift token != fee token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftTokenMock = await deployMockERC20();

    const { gift } = await defaultDepositTestSetup({
      factory,
      overrides: { giftAmount: 100n, feeAmount: 0n, giftTokenAddress: giftTokenMock.address },
    });

    const escrowAddress = gift.escrowAddress();

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const feeToken: Erc20Contract = await manager.loadContract(gift.feeToken);
    expect(await giftToken.balance_of(escrowAddress)).to.equal(gift.giftAmount);
    expect(await feeToken.balance_of(escrowAddress)).to.equal(gift.feeAmount);
  });

  it(`Deposit works (gift token != fee token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftTokenMock = await deployMockERC20();

    const { gift } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: giftTokenMock.address },
    });

    const escrowAddress = gift.escrowAddress();

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const feeToken: Erc20Contract = await manager.loadContract(gift.feeToken);
    expect(await giftToken.balance_of(escrowAddress)).to.equal(gift.giftAmount);
    expect(await feeToken.balance_of(escrowAddress)).to.equal(gift.feeAmount);
  });

  it(`Max fee too high gift_amount > fee_amount (gift token == fee token)`, async function () {
    const { factory } = await setupGiftProtocol();

    await expectRevertWithErrorMessage(
      "gift-fac/fee-too-high",
      (async () => {
        const { txReceipt } = await defaultDepositTestSetup({
          factory,
          overrides: { giftAmount: 100n, feeAmount: 101n },
        });
        return txReceipt;
      })(),
    );
  });

  it(`Fee not ETH nor STRK`, async function () {
    const { factory } = await setupGiftProtocol();
    const mockERC20 = await deployMockERC20();

    await expectRevertWithErrorMessage(
      "gift-fac/invalid-fee-token",
      (async () => {
        const { txReceipt } = await defaultDepositTestSetup({
          factory,
          overrides: { feeTokenAddress: mockERC20.address },
        });
        return txReceipt;
      })(),
    );
  });

  it("Deposit fails class hash passed != class hash in factory storage", async function () {
    const { factory } = await setupGiftProtocol();
    const invalidEscrowAccountClassHash = "0x1234";

    await expectRevertWithErrorMessage(
      "gift-fac/invalid-class-hash",
      (async () => {
        const { txReceipt } = await defaultDepositTestSetup({
          factory,
          overrides: {
            escrowAccountClassHash: invalidEscrowAccountClassHash,
          },
        });
        return txReceipt;
      })(),
    );
  });

  it("Deposit fails if erc reverts", async function () {
    const brokenERC20 = await manager.declareAndDeployContract("BrokenERC20", {
      unique: true,
    });
    const { factory } = await setupGiftProtocol();

    await expectRevertWithErrorMessage(
      "gift-fac/transfer-gift-failed",
      (async () => {
        const { txReceipt } = await defaultDepositTestSetup({
          factory,
          overrides: { giftTokenAddress: brokenERC20.address },
        });
        return txReceipt;
      })(),
    );
  });
});
