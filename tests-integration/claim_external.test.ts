import { expect } from "chai";
import { byteArray, uint256 } from "starknet";
import type { Erc20Contract } from "starknet-dev-toolkit";
import { deployer, expectRevertWithErrorMessage, manager } from "starknet-dev-toolkit";
import { cancelGift, claimExternal, randomReceiver, signExternalClaim, waitForSuccess } from "../lib/claim.js";
import type { ReentrantERC20Contract } from "../lib/contract-types.js";
import { defaultDepositTestSetup } from "../lib/deposit.js";
import { deployMockERC20, setupGiftProtocol } from "../lib/protocol.js";

describe("Claim External", function () {
  it(`gift_token == fee_token (no dust receiver)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    await claimExternal({ gift, receiver, giftPrivateKey });

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const feeToken: Erc20Contract = await manager.loadContract(gift.feeToken);
    expect(await giftToken.balance_of(escrowAddress)).to.equal(gift.feeAmount);
    expect(await giftToken.balance_of(receiver)).to.equal(gift.giftAmount);
    expect(await feeToken.balance_of(escrowAddress)).to.equal(gift.feeAmount);
  });

  it(`gift_token == fee_token (w/ dust receiver)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const dustReceiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const feeToken: Erc20Contract = await manager.loadContract(gift.feeToken);
    const balanceBefore = await giftToken.balance_of(escrowAddress);
    await claimExternal({ gift, receiver, giftPrivateKey, dustReceiver });

    expect(await giftToken.balance_of(receiver)).to.equal(gift.giftAmount);
    expect(await giftToken.balance_of(dustReceiver)).to.equal(balanceBefore - gift.giftAmount);
    expect(await giftToken.balance_of(escrowAddress)).to.equal(0n);
    expect(await feeToken.balance_of(escrowAddress)).to.equal(0n);
  });

  it(`gift_token != fee_token (w/ dust receiver)`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftToken = await deployMockERC20();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: giftToken.address },
    });
    const receiver = randomReceiver();
    const dustReceiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    await claimExternal({ gift, receiver, giftPrivateKey, dustReceiver });

    const giftTokenContract: Erc20Contract = await manager.loadContract(gift.giftToken);
    const feeToken: Erc20Contract = await manager.loadContract(gift.feeToken);
    expect(await giftTokenContract.balance_of(receiver)).to.equal(gift.giftAmount);
    expect(await feeToken.balance_of(dustReceiver)).to.equal(gift.feeAmount);
    expect(await giftTokenContract.balance_of(escrowAddress)).to.equal(0n);
    expect(await feeToken.balance_of(escrowAddress)).to.equal(0n);
  });

  it(`gift_token != fee_token (no dust receiver)`, async function () {
    const { factory } = await setupGiftProtocol();
    const giftToken = await deployMockERC20();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: giftToken.address },
    });
    const receiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    await claimExternal({ gift, receiver, giftPrivateKey });

    const giftTokenContract: Erc20Contract = await manager.loadContract(gift.giftToken);
    const feeToken: Erc20Contract = await manager.loadContract(gift.feeToken);
    expect(await giftTokenContract.balance_of(receiver)).to.equal(gift.giftAmount);
    expect(await giftTokenContract.balance_of(escrowAddress)).to.equal(0n);
    expect(await feeToken.balance_of(escrowAddress)).to.equal(gift.feeAmount);
  });

  it(`Zero Receiver`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = "0x0";

    await expectRevertWithErrorMessage("escr-lib/zero-receiver", claimExternal({ gift, receiver, giftPrivateKey }));
  });

  it(`Cannot call claim external twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimExternal({ gift, receiver, giftPrivateKey });
    await expectRevertWithErrorMessage("escr-lib/claimed-or-cancel", claimExternal({ gift, receiver, giftPrivateKey }));
  });

  it(`Invalid Signature`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    await expectRevertWithErrorMessage(
      "escr-lib/invalid-ext-signature",
      claimExternal({ gift: gift, receiver, giftPrivateKey: "0x1234" }),
    );
  });

  it(`Claim gift cancelled`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const balanceSenderBefore = await giftToken.balance_of(deployer.address);
    const { transaction_hash } = await cancelGift({ gift });
    const txFee = BigInt((await waitForSuccess(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    expect(await giftToken.balance_of(deployer.address)).to.equal(
      balanceSenderBefore + gift.giftAmount + gift.feeAmount - txFee,
    );
    // Check balance gift address address == 0
    expect(await giftToken.balance_of(escrowAddress)).to.equal(0n);

    await expectRevertWithErrorMessage("escr-lib/claimed-or-cancel", claimExternal({ gift, receiver, giftPrivateKey }));
  });

  // Commented out to pass CI temporarily
  it(`Not possible to claim more via reentrancy`, async function () {
    const { factory } = await setupGiftProtocol();
    const receiver = randomReceiver();

    const reentrant: ReentrantERC20Contract = await manager.declareAndDeployContract("ReentrantERC20", {
      unique: true,
      constructorCalldata: [
        byteArray.byteArrayFromString("ReentrantUSDC"),
        byteArray.byteArrayFromString("RUSDC"),
        uint256.bnToUint256(100e18),
        deployer.address,
        factory.address,
      ],
    });
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: reentrant.address },
    });

    const claimSig = await signExternalClaim({ gift, receiver, giftPrivateKey });

    reentrant.providerOrAccount = deployer;
    const { transaction_hash } = await reentrant.set_gift_data(gift.toCallData(), receiver, "0x0", claimSig);
    await waitForSuccess(transaction_hash);

    await expectRevertWithErrorMessage(
      "ERC20: insufficient balance",
      claimExternal({ gift, receiver, giftPrivateKey }),
    );
  });
});
