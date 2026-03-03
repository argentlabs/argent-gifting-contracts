import { expect } from "chai";
import type { Erc20Contract } from "starknet-dev-toolkit";
import { deployer, expectRevertWithErrorMessage, manager } from "starknet-dev-toolkit";
import { cancelGift, claimInternal, randomReceiver } from "../lib/claim.js";
import { defaultDepositTestSetup } from "../lib/deposit.js";
import { deployMockERC20, devnetAccount, setupGiftProtocol } from "../lib/protocol.js";

describe("Cancel Gift", function () {
  it(`fee_token == gift_token`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const feeToken: Erc20Contract = await manager.loadContract(gift.feeToken);
    const balanceSenderBefore = await giftToken.balance_of(deployer.address);

    const response = await cancelGift({ gift });

    const txFee = BigInt((await manager.ensureSuccess(response)).actual_fee.amount);
    // Check balance of the sender is correct
    expect(await giftToken.balance_of(deployer.address)).to.equal(
      balanceSenderBefore + gift.giftAmount + gift.feeAmount - txFee,
    );
    // Check balance gift address address == 0
    expect(await feeToken.balance_of(escrowAddress)).to.equal(0n);

    await expectRevertWithErrorMessage("escr-lib/claimed-or-cancel", claimInternal({ gift, receiver, giftPrivateKey }));
  });

  it(`fee_token != gift_token`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: mockERC20.address },
    });
    const receiver = randomReceiver();
    const escrowAddress = gift.escrowAddress();

    const giftToken: Erc20Contract = await manager.loadContract(gift.giftToken);
    const feeToken: Erc20Contract = await manager.loadContract(gift.feeToken);
    const balanceSenderBeforeGiftToken = await giftToken.balance_of(deployer.address);
    const balanceSenderBeforeFeeToken = await feeToken.balance_of(deployer.address);
    const response = await cancelGift({ gift });

    const txFee = BigInt((await manager.ensureSuccess(response)).actual_fee.amount);
    // Check balance of the sender is correct
    expect(await giftToken.balance_of(deployer.address)).to.equal(balanceSenderBeforeGiftToken + gift.giftAmount);
    expect(await feeToken.balance_of(deployer.address)).to.equal(balanceSenderBeforeFeeToken + gift.feeAmount - txFee);
    // Check balance gift address address == 0
    expect(await giftToken.balance_of(escrowAddress)).to.equal(0n);
    expect(await feeToken.balance_of(escrowAddress)).to.equal(0n);

    await expectRevertWithErrorMessage("escr-lib/claimed-or-cancel", claimInternal({ gift, receiver, giftPrivateKey }));
  });

  it(`wrong sender`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const senderAccount = await devnetAccount();
    // original: "escr-lib/wrong-sender" (cfr README ## Error handling)
    await expectRevertWithErrorMessage("Result::unwrap failed.", cancelGift({ gift, senderAccount }));
  });

  it(`already claimed (gift_token == fee_token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();
    await claimInternal({ gift, receiver, giftPrivateKey });
    // original: "escr-lib/claimed-or-cancel" (cfr README ## Error handling)
    await expectRevertWithErrorMessage("Result::unwrap failed.", cancelGift({ gift }));
  });

  it(`already claimed (gift_token != fee_token)`, async function () {
    const mockERC20 = await deployMockERC20();
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: mockERC20.address },
    });
    const receiver = randomReceiver();

    await claimInternal({ gift, receiver, giftPrivateKey });
    // original: "escr-lib/claimed-or-cancel" (cfr README ## Error handling)
    await expectRevertWithErrorMessage("Result::unwrap failed.", cancelGift({ gift }));
  });
});
