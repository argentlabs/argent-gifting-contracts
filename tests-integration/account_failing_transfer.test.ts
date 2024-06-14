import { expect } from "chai";
import {
  buildCallDataClaim,
  claimExternal,
  claimInternal,
  defaultDepositTestSetup,
  deployFailingTransferERC20,
  deployer,
  getClaimAccount,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe.only("Failing transfer impossible", function () {
  // it(`Testing simple claim flow using ETH as token fee`, async function () {
  //   const useTxV3 = false;
  //   const loopERC20 = await deployFailingTransferERC20();
  //   const { factory } = await setupGiftProtocol();
  //   const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, useTxV3, undefined, loopERC20.address);
  //   const receiver = randomReceiver();

  //   const claimAccount = getClaimAccount(claim, claimPrivateKey);
  //   loopERC20.connect(deployer);
  //   await loopERC20.should_fail(false);
  //   const estimate = await claimAccount.estimateFee([
  //     {
  //       contractAddress: claim.factory,
  //       calldata: [buildCallDataClaim(claim), receiver],
  //       entrypoint: "claim_internal",
  //     },
  //   ]);
  //   await loopERC20.should_fail(true);

  //   try {
  //     const { transaction_hash } = await claimInternal(claim, receiver, claimPrivateKey, {
  //       skipValidate: true,
  //       ...estimate,
  //     });
  //     const { revert_reason } = await manager.waitForTransaction(transaction_hash);
  //     expect(revert_reason).to.contains("Fail ERC20 transfer TEST");
  //   } catch (e) {
  //     console.log;
  //   }

  //   await claimAccount.getNonce().should.eventually.equal("0x1");
  //   const finalBalanceGift = await loopERC20.balance_of(claimAccount.address);
  //   const feeToken = await manager.tokens.feeTokenContract(useTxV3);
  //   const finalBalanceFee = await feeToken.balance_of(claimAccount.address);
  //   expect(finalBalanceGift).to.be.equal(claim.gift_amount);
  //   expect(finalBalanceFee < claim.fee_amount).to.be.true;

  //   loopERC20.connect(deployer);
  //   await loopERC20.should_fail(false);
  // });

  it(`Testing simple claim flow using STRK as token fee`, async function () {
    const useTxV3 = true;
    const loopERC20 = await deployFailingTransferERC20();
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, useTxV3, undefined, loopERC20.address);
    const receiver = randomReceiver();

    const claimAccount = getClaimAccount(claim, claimPrivateKey);
    // TODO Should this be part of the deployFailingTransferERC20 fn??? causing inconsistency between tests
    loopERC20.connect(deployer);
    await loopERC20.should_fail(false);
    const estimate = await claimAccount.estimateFee([
      {
        contractAddress: claim.factory,
        calldata: [buildCallDataClaim(claim), receiver],
        entrypoint: "claim_internal",
      },
    ]);

    await loopERC20.should_fail(true);
    const { transaction_hash } = await claimInternal(claim, receiver, claimPrivateKey, estimate);
    const { revert_reason } = await manager.waitForTransaction(transaction_hash);
    expect(revert_reason).to.contains("Fail ERC20 transfer TEST");

    await claimAccount.getNonce().should.eventually.equal("0x1");
    let finalBalanceGift = await loopERC20.balance_of(claimAccount.address);
    const feeToken = await manager.tokens.strkContract();
    const feeBalance = await feeToken.balance_of(claimAccount.address);
    expect(finalBalanceGift).to.be.equal(claim.gift_amount);
    expect(feeBalance < claim.fee_amount).to.be.true;

    await loopERC20.should_fail(false);
    await claimExternal(claim, receiver, claimPrivateKey);
    finalBalanceGift = await loopERC20.balance_of(claimAccount.address);
    const finalBalanceFee = await feeToken.balance_of(claimAccount.address);
    expect(feeBalance).to.be.equal(finalBalanceFee);
    expect(finalBalanceGift).to.be.equal(0n);
  });
});
