import { expect } from "chai";
import { Account, CallData, RPC, hash, num, uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, expectRevertWithErrorMessage, manager } from "../lib";

describe("Gifting", function () {
  const signer = new LegacyStarknetKeyPair();
  const claimPubkey = signer.publicKey;
  const amount = 1000000000000000n;
  const maxFee = 50000000000000n;
  const receiver = "0x42";

  for (const useTxV3 of [false, true]) {
    it(`Testing simple claim flow using txV3: ${useTxV3}`, async function () {
      await manager.restartDevnetAndClearClassCache();
      // Deploy factory
      const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
      const factory = await manager.deployContract("GiftFactory", {
        unique: true,
        constructorCalldata: [claimAccountClassHash, deployer.address],
      });

      // Make a gift
      const tokenContract = await manager.tokens.feeTokenContract(useTxV3);
      tokenContract.connect(deployer);
      factory.connect(deployer);
      await tokenContract.approve(factory.address, amount + maxFee);
      await factory.deposit(amount, maxFee, tokenContract.address, claimPubkey);

      // Ensure there is a contract for the claim
      const claimAddress = await factory.get_claim_address(
        deployer.address,
        amount,
        maxFee,
        tokenContract.address,
        claimPubkey,
      );

      const constructorArgs = {
        sender: deployer.address,
        amount: uint256.bnToUint256(amount),
        max_fee: maxFee,
        token: tokenContract.address,
        claim_pubkey: claimPubkey,
      };
      const claim = {
        factory: factory.address,
        class_hash: claimAccountClassHash,
        ...constructorArgs,
      };

      const correctAddress = hash.calculateContractAddressFromHash(
        0,
        claimAccountClassHash,
        CallData.compile(constructorArgs),
        factory.address,
      );
      expect(claimAddress).to.be.equal(num.toBigInt(correctAddress));

      // Check balance of the claim contract is correct
      await tokenContract.balance_of(claimAddress).should.eventually.equal(amount + maxFee);
      // Check balance receiver address == 0
      await tokenContract.balance_of(receiver).should.eventually.equal(0n);

      const txVersion = useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
      const claimAccount = new Account(manager, num.toHex(claimAddress), signer, undefined, txVersion);
      factory.connect(claimAccount);
      if (useTxV3) {
        const estimate = await factory.estimateFee.claim_internal(claim, receiver);
        const newResourceBounds = {
          ...estimate.resourceBounds,
          l2_gas: {
            ...estimate.resourceBounds.l2_gas,
            max_amount: maxFee + 1n,
            max_price_per_unit: num.toHexString(4),
          },
        };
        await expectRevertWithErrorMessage("gift-acc/insufficient-v3-fee", () =>
          claimAccount.execute(
            [
              {
                contractAddress: factory.address,
                calldata: [claim, receiver],
                entrypoint: "claim_internal",
              },
            ],
            undefined,
            { resourceBounds: newResourceBounds, tip: 1 },
          ),
        );
      } else {
        await expectRevertWithErrorMessage("gift-acc/insufficient-v1-fee", () =>
          factory.claim_internal(claim, receiver, { maxFee: maxFee + 1n }),
        );
      }
      await factory.claim_internal(claim, receiver);

      // Final check
      const finalBalance = await tokenContract.balance_of(claimAddress);
      expect(finalBalance < maxFee).to.be.true;
      await tokenContract.balance_of(receiver).should.eventually.equal(amount);
    });
  }

  it(`Test basic validation asserts`, async function () {
    await manager.restartDevnetAndClearClassCache();
    // Deploy factory
    const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
    const factory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });

    const fakeFactory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });

    // Make a gift
    const tokenContract = await manager.tokens.feeTokenContract(false);
    tokenContract.connect(deployer);
    factory.connect(deployer);
    await tokenContract.approve(factory.address, amount + maxFee);
    await factory.deposit(amount, maxFee, tokenContract.address, claimPubkey);

    // Ensure there is a contract for the claim
    const claimAddress = await factory.get_claim_address(
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

    const constructorCalldata = CallData.compile(claim);
    const correctAddress = hash.calculateContractAddressFromHash(0, claimAccountClassHash, constructorCalldata, 0);
    expect(claimAddress).to.be.equal(num.toBigInt(correctAddress));

    // Check balance of the claim contract is correct
    await tokenContract.balance_of(claimAddress).should.eventually.equal(amount + maxFee);
    // Check balance receiver address == 0
    await tokenContract.balance_of(receiver).should.eventually.equal(0n);

    const claimContract = await manager.loadContract(num.toHex(claimAddress));
    const claimAccount = new Account(manager, claimContract.address, signer, undefined, RPC.ETransactionVersion.V2);
    // only protocol
    claimContract.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/only-protocol", () => claimContract.__validate__([]));

    // cant call another contract
    fakeFactory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      fakeFactory.claim_internal(claim, receiver, { maxFee: 400000000000000n }),
    );

    // wrong selector
    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () => factory.get_claim_class_hash());

    // multicall
    await expectRevertWithErrorMessage("gift-acc/invalid-call-len", () =>
      claimAccount.execute([
        {
          contractAddress: factory.address,
          calldata: [claim, receiver],
          entrypoint: "claim_internal",
        },
        {
          contractAddress: factory.address,
          calldata: [claim, receiver],
          entrypoint: "claim_internal",
        },
      ]),
    );

    // double claim
    await factory.claim_internal(claim, receiver);
    await expectRevertWithErrorMessage("gift-acc/invalid-claim-nonce", () =>
      claimAccount.execute(
        [
          {
            contractAddress: factory.address,
            calldata: [claim, receiver],
            entrypoint: "claim_internal",
          },
        ],
        undefined,
        { skipValidate: false },
      ),
    );
  });

  // TODO Tests:
  // - claim_external
  // - check with wrong claim data
  // - claim without enough fee to full-fill execution
  // - cancel
  // - get_dust
  // - All validate branches
  // - What if ERC20 reverts? (check every fn with that)
});
