import { expect } from "chai";
import { Account, RPC, num, uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, expectRevertWithErrorMessage, genericAccount, manager } from "../lib";
import { GIFT_AMOUNT, GIFT_MAX_FEE, setupClaim } from "./setupClaim";

describe("Factory", function () {
  let claimAccountClassHash: string;
  before(async () => {
    claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
  });

  for (const useTxV3 of [false, true]) {
    it(`get_dust: ${useTxV3}`, async function () {
      const { factory, tokenContract, claimAccount, claim, receiver } = await setupClaim(useTxV3);
      const receiverDust = `0x${Math.floor(Math.random() * 10)}`;

      await factory.claim_internal(claim, receiver);

      // Final check
      const dustBalance = await tokenContract.balance_of(claimAccount.address);
      expect(dustBalance < GIFT_MAX_FEE).to.be.true;
      await tokenContract.balance_of(receiver).should.eventually.equal(GIFT_AMOUNT);

      // Test dust
      await tokenContract.balance_of(receiverDust).should.eventually.equal(0n);

      factory.connect(deployer);
      await factory.get_dust(claim, receiverDust);
      await tokenContract.balance_of(claimAccount.address).should.eventually.equal(0n);
      await tokenContract.balance_of(receiverDust).should.eventually.equal(dustBalance);
    });
  }

  it(`Test Cancel Claim`, async function () {
    const { factory, tokenContract, claimAccount, claim, receiver } = await setupClaim();

    const balanceSenderBefore = await tokenContract.balance_of(deployer.address);
    factory.connect(deployer);
    const { transaction_hash } = await factory.cancel(claim);
    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await tokenContract
      .balance_of(deployer.address)
      .should.eventually.equal(balanceSenderBefore + GIFT_AMOUNT + GIFT_MAX_FEE - txFee);
    // Check balance claim address address == 0
    await tokenContract.balance_of(claimAccount.address).should.eventually.equal(0n);

    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/gift-canceled", () => factory.claim_internal(claim, receiver));
  });

  it(`Test pausable`, async function () {
    // Deploy factory
    const factory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });
    const signer = new LegacyStarknetKeyPair();
    const claimPubkey = signer.publicKey;
    const GIFT_AMOUNT = 1000000000000000n;
    const GIFT_MAX_FEE = 50000000000000n;
    const receiver = "0x45";

    // Make a gift
    const tokenContract = await manager.tokens.feeTokenContract(false);
    tokenContract.connect(deployer);
    factory.connect(deployer);
    await tokenContract.approve(factory.address, GIFT_AMOUNT + GIFT_MAX_FEE);

    factory.connect(genericAccount);
    await expectRevertWithErrorMessage("Caller is not the owner", () => factory.pause());
    factory.connect(deployer);
    await factory.pause();
    await expectRevertWithErrorMessage("Pausable: paused", () =>
      factory.deposit(GIFT_AMOUNT, GIFT_MAX_FEE, tokenContract.address, claimPubkey),
    );

    await factory.unpause();
    await factory.deposit(GIFT_AMOUNT, GIFT_MAX_FEE, tokenContract.address, claimPubkey);

    // Ensure there is a contract for the claim
    const claimAddress = await factory.get_claim_address(
      deployer.address,
      GIFT_AMOUNT,
      GIFT_MAX_FEE,
      tokenContract.address,
      claimPubkey,
    );

    const claim = {
      factory: factory.address,
      class_hash: claimAccountClassHash,
      sender: deployer.address,
      amount: uint256.bnToUint256(GIFT_AMOUNT),
      max_fee: GIFT_MAX_FEE,
      token: tokenContract.address,
      claim_pubkey: claimPubkey,
    };

    const claimContract = await manager.loadContract(num.toHex(claimAddress));
    const claimAccount = new Account(manager, claimContract.address, signer, undefined, RPC.ETransactionVersion.V2);

    // Check balance of the claim contract is correct
    await tokenContract.balance_of(claimAddress).should.eventually.equal(GIFT_AMOUNT + GIFT_MAX_FEE);
    // Check balance receiver address == 0
    await tokenContract.balance_of(receiver).should.eventually.equal(0n);

    factory.connect(claimAccount);
    await factory.claim_internal(claim, receiver);

    // Final check
    const dustBalance = await tokenContract.balance_of(claimAddress);
    expect(dustBalance < GIFT_MAX_FEE).to.be.true;
    await tokenContract.balance_of(receiver).should.eventually.equal(GIFT_AMOUNT);
  });
});
