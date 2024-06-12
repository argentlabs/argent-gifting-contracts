import { Account, RPC, num } from "starknet";
import {
  buildCallDataClaim,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  expectRevertWithErrorMessage,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Claim Account", function () {
  it(`Test only protocol can call claim contract`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);

    const claimAddress = calculateClaimAddress(claim);

    const claimAccount = new Account(
      manager,
      num.toHex(claimAddress),
      claimPrivateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );
    const claimContract = await manager.loadContract(claimAddress);
    claimContract.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/only-protocol", () => claimContract.__validate__([]));
  });

  it(`Test claim contract cant call another contract`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const fakeFactory = await manager.deployContract("GiftFactory", {
      unique: true,
      constructorCalldata: [claimAccountClassHash, deployer.address],
    });

    const claimAddress = calculateClaimAddress(claim);

    const claimAccount = new Account(
      manager,
      num.toHex(claimAddress),
      claimPrivateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );
    fakeFactory.connect(claimAccount);

    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      fakeFactory.claim_internal(buildCallDataClaim(claim), receiver, { maxFee: 400000000000000n }),
    );
  });

  it(`Test claim contract can only call 'claim_internal'`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAddress = calculateClaimAddress(claim);

    const claimAccount = new Account(
      manager,
      num.toHex(claimAddress),
      claimPrivateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );

    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () =>
      factory.get_dust(claim, receiver, { maxFee: 400000000000000n }),
    );
  });

  it(`Test claim contract cant preform a multicall`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    const claimAddress = calculateClaimAddress(claim);

    const claimAccount = new Account(
      manager,
      num.toHex(claimAddress),
      claimPrivateKey,
      undefined,
      RPC.ETransactionVersion.V2,
    );

    await expectRevertWithErrorMessage("gift-acc/invalid-call-len", () =>
      claimAccount.execute([
        {
          contractAddress: factory.address,
          calldata: [buildCallDataClaim(claim), receiver],
          entrypoint: "claim_internal",
        },
        {
          contractAddress: factory.address,
          calldata: [buildCallDataClaim(claim), receiver],
          entrypoint: "claim_internal",
        },
      ]),
    );
  });

  it(`Test cannot call 'claim_internal' twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup(factory);
    const receiver = randomReceiver();

    // double claim
    await claimInternal(claim, receiver, claimPrivateKey);
    await expectRevertWithErrorMessage("gift-acc/invalid-claim-nonce", () =>
      claimInternal(claim, receiver, claimPrivateKey, { skipValidate: false }),
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
