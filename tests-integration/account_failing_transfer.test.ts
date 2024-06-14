import { expect } from "chai";
import {
  GIFT_MAX_FEE,
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

describe("Failing transfer impossible", function () {
  for (const useTxV3 of [false, true]) {
    it.only(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
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
      const { transaction_hash } = await claimInternal(claim, receiver, claimPrivateKey, {
        ...estimate,
        maxFee: GIFT_MAX_FEE,
      });
      
      const { revert_reason } = await manager.waitForTransaction(transaction_hash);
      expect(revert_reason).to.contains("Fail ERC20 transfer TEST");

      await claimAccount.getNonce().should.eventually.equal("0x1");
      const failingBalanceGift = await loopERC20.balance_of(claimAccount.address);
      const feeTokenContract = await manager.tokens.feeTokenContract(useTxV3);
      const failingFeeBalance = await feeTokenContract.balance_of(claimAccount.address);
      expect(failingBalanceGift).to.be.equal(claim.gift_amount);
      expect(failingFeeBalance < claim.fee_amount).to.be.true;

      await loopERC20.should_fail(false);
      await claimExternal(claim, receiver, claimPrivateKey);
      const finalBalanceGift = await loopERC20.balance_of(claimAccount.address);
      const finalBalanceFee = await feeTokenContract.balance_of(claimAccount.address);
      expect(failingFeeBalance).to.be.equal(finalBalanceFee);
      expect(finalBalanceGift).to.be.equal(0n);
    });
  }
});
