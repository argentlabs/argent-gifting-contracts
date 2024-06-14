import { expect } from "chai";
import { Account, RPC, num } from "starknet";
import {
  GIFT_MAX_FEE,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployLoopERC20,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Transfer impossible", function () {
  for (const useTxV3 of [false, true]) {
    it.only(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      const loopERC20 = await deployLoopERC20();
      const { factory } = await setupGiftProtocol();
      const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory, useTxV3, undefined, loopERC20.address);
      const receiver = randomReceiver();

      const newResourceBounds = {
        maxFee: GIFT_MAX_FEE,
        resourceBounds: {
          l2_gas: {
            max_amount: num.toHexString(1),
            max_price_per_unit: num.toHexString(1),
          },
          l1_gas: {
            max_amount: num.toHexString(10),
            max_price_per_unit: num.toHexString(36000000000n), // Current devnet gas price
          },
        },
      };
      const { transaction_hash } = await claimInternal(claim, receiver, claimPrivateKey, newResourceBounds);

      const receipt = await manager.getTransactionReceipt(transaction_hash);
      expect(receipt.revert_reason).to.contains(
        "Could not reach the end of the program. RunResources has no remaining steps.",
      );

      const claimAddress = calculateClaimAddress(claim);
      const claim_account = new Account(manager, claimAddress, claimPrivateKey, undefined, RPC.ETransactionVersion.V2);
      await claim_account.getNonce().should.eventually.equal("0x1");
      const finalBalanceGift = await loopERC20.balance_of(claimAddress);
      const feeToken = await manager.tokens.feeTokenContract(useTxV3);
      const finalBalanceFee = await feeToken.balance_of(claimAddress);
      expect(finalBalanceGift).to.be.equal(claim.gift_amount);
      expect(finalBalanceFee < claim.fee_amount).to.be.true;
    });
  }
});
