import { expect } from "chai";
import { Account, RPC, num, uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, expectRevertWithErrorMessage, genericAccount, manager } from "../lib";

describe("Factory", function () {
  for (const useTxV3 of [false, true]) {
    it(`get_dust: ${useTxV3}`, async function () {
      await manager.restartDevnetAndClearClassCache();
      // Deploy factory
      const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
      const factory = await manager.deployContract("GiftFactory", {
        unique: true,
        constructorCalldata: [claimAccountClassHash, deployer.address],
      });
      const signer = new LegacyStarknetKeyPair();
      const claimPubkey = signer.publicKey;
      const amount = 1000000000000000n;
      const maxFee = 50000000000000n;
      const receiver = "0x42";
      const receiverDust = "0x43";

      // Make a gift
      const tokenContract = await manager.tokens.feeTokenContract(useTxV3);
      tokenContract.connect(deployer);
      factory.connect(deployer);
      await tokenContract.approve(factory.address, amount + maxFee);
      await factory.deposit(amount, maxFee, tokenContract.address, claimPubkey);

      // Ensure there is a contract for the claim
      const claimAddress = await factory.get_claim_address(
        claimAccountClassHash,
        deployer.address,
        amount,
        maxFee,
        tokenContract.address,
        claimPubkey,
      );

      const claim = {
        factory: factory.address,
        class_hash: claimAccountClassHash,
        sender: deployer.address,
        amount: uint256.bnToUint256(amount),
        max_fee: maxFee,
        token: tokenContract.address,
        claim_pubkey: claimPubkey,
      };

      // Check balance of the claim contract is correct
      await tokenContract.balance_of(claimAddress).should.eventually.equal(amount + maxFee);
      // Check balance receiver address == 0
      await tokenContract.balance_of(receiver).should.eventually.equal(0n);

      const claimContract = await manager.loadContract(num.toHex(claimAddress));
      const txVersion = useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
      const claimAccount = new Account(manager, claimContract.address, signer, undefined, txVersion);
      factory.connect(claimAccount);
      await factory.claim_internal(claim, receiver);

      // Final check
      const dustBalance = await tokenContract.balance_of(claimAddress);
      expect(dustBalance < maxFee).to.be.true;
      await tokenContract.balance_of(receiver).should.eventually.equal(amount);

      // Test dust
      await tokenContract.balance_of(receiverDust).should.eventually.equal(0n);

      factory.connect(deployer);
      await factory.get_dust(claim, receiverDust);
      await tokenContract.balance_of(claimAccount.address).should.eventually.equal(0n);
      await tokenContract.balance_of(receiverDust).should.eventually.equal(dustBalance);
    });
  }

  it(`Test Cancel Claim`, async function () {
    await manager.restartDevnetAndClearClassCache();
    // Deploy factory
    const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
    const factory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });
    const signer = new LegacyStarknetKeyPair();
    const claimPubkey = signer.publicKey;
    const amount = 1000000000000000n;
    const maxFee = 50000000000000n;
    const receiver = "0x42";

    // Make a gift
    const tokenContract = await manager.tokens.feeTokenContract(false);
    tokenContract.connect(deployer);
    factory.connect(deployer);
    await tokenContract.approve(factory.address, amount + maxFee);
    await factory.deposit(amount, maxFee, tokenContract.address, claimPubkey);

    // Ensure there is a contract for the claim
    const claimAddress = await factory.get_claim_address(
      claimAccountClassHash,
      deployer.address,
      amount,
      maxFee,
      tokenContract.address,
      claimPubkey,
    );

    const claim = {
      factory: factory.address,
      class_hash: claimAccountClassHash,
      sender: deployer.address,
      amount: uint256.bnToUint256(amount),
      max_fee: maxFee,
      token: tokenContract.address,
      claim_pubkey: claimPubkey,
    };

    // Check balance of the claim contract is correct
    await tokenContract.balance_of(claimAddress).should.eventually.equal(amount + maxFee);
    // Check balance receiver address == 0
    await tokenContract.balance_of(receiver).should.eventually.equal(0n);

    const claimContract = await manager.loadContract(num.toHex(claimAddress));
    const claimAccount = new Account(manager, claimContract.address, signer, undefined, RPC.ETransactionVersion.V2);

    const balanceSenderBefore = await tokenContract.balance_of(deployer.address);
    const { transaction_hash } = await factory.cancel(claim);
    const txFee = BigInt((await manager.getTransactionReceipt(transaction_hash)).actual_fee.amount);
    // Check balance of the sender is correct
    await tokenContract
      .balance_of(deployer.address)
      .should.eventually.equal(balanceSenderBefore + amount + maxFee - txFee);
    // Check balance claim address address == 0
    await tokenContract.balance_of(claimAddress).should.eventually.equal(0n);

    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift/already-claimed-or-cancel", () => factory.claim_internal(claim, receiver));
  });

  it(`Test pausable`, async function () {
    await manager.restartDevnetAndClearClassCache();
    // Deploy factory
    const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
    const factory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });
    const signer = new LegacyStarknetKeyPair();
    const claimPubkey = signer.publicKey;
    const amount = 1000000000000000n;
    const maxFee = 50000000000000n;
    const receiver = "0x42";

    // Make a gift
    const tokenContract = await manager.tokens.feeTokenContract(false);
    tokenContract.connect(deployer);
    factory.connect(deployer);
    await tokenContract.approve(factory.address, amount + maxFee);

    factory.connect(genericAccount);
    await expectRevertWithErrorMessage("Caller is not the owner", () => factory.pause());
    factory.connect(deployer);
    await factory.pause();
    await expectRevertWithErrorMessage("Pausable: paused", () =>
      factory.deposit(amount, maxFee, tokenContract.address, claimPubkey),
    );

    await factory.unpause();
    await factory.deposit(amount, maxFee, tokenContract.address, claimPubkey);

    // Ensure there is a contract for the claim
    const claimAddress = await factory.get_claim_address(
      claimAccountClassHash,
      deployer.address,
      amount,
      maxFee,
      tokenContract.address,
      claimPubkey,
    );

    const claim = {
      factory: factory.address,
      class_hash: claimAccountClassHash,
      sender: deployer.address,
      amount: uint256.bnToUint256(amount),
      max_fee: maxFee,
      token: tokenContract.address,
      claim_pubkey: claimPubkey,
    };

    const claimContract = await manager.loadContract(num.toHex(claimAddress));
    const claimAccount = new Account(manager, claimContract.address, signer, undefined, RPC.ETransactionVersion.V2);

    // Check balance of the claim contract is correct
    await tokenContract.balance_of(claimAddress).should.eventually.equal(amount + maxFee);
    // Check balance receiver address == 0
    await tokenContract.balance_of(receiver).should.eventually.equal(0n);

    factory.connect(claimAccount);
    await factory.claim_internal(claim, receiver);

    // Final check
    const dustBalance = await tokenContract.balance_of(claimAddress);
    expect(dustBalance < maxFee).to.be.true;
    await tokenContract.balance_of(receiver).should.eventually.equal(amount);
  });
});
