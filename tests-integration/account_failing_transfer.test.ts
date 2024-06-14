import { expect } from "chai";
import {
  buildCallDataClaim,
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
  for (const useTxV3 of [false]) {
    it.only(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      const loopERC20 = await deployFailingTransferERC20();
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, useTxV3, undefined, loopERC20.address);
      const receiver = randomReceiver();

      const claimAccount = getClaimAccount(claim, claimPrivateKey);
      const estimate = await claimAccount.estimateFee(
        [
          {
            contractAddress: claim.factory,
            calldata: [buildCallDataClaim(claim), receiver],
            entrypoint: "claim_internal",
          },
        ],
      );
      loopERC20.connect(deployer);
      await loopERC20.should_fail(true);

      try {
        const { transaction_hash } = await claimInternal(claim, receiver, claimPrivateKey, {skipValidate:true, ...estimate});
        const {revert_reason} = await manager.waitForTransaction(transaction_hash);
        expect(revert_reason).to.contains("Fail ERC20 transfer TEST");

      }catch (e) {
        console.log
      }

      await claimAccount.getNonce().should.eventually.equal("0x1");
      const finalBalanceGift = await loopERC20.balance_of(claimAccount.address);
      const feeToken = await manager.tokens.feeTokenContract(useTxV3);
      const finalBalanceFee = await feeToken.balance_of(claimAccount.address);
      expect(finalBalanceGift).to.be.equal(claim.gift_amount);
      expect(finalBalanceFee < claim.fee_amount).to.be.true;

      loopERC20.connect(deployer);
      await loopERC20.should_fail(false);
    });
  }
});
