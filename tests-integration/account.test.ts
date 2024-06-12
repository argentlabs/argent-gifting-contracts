import { Account, RPC, num } from "starknet";
import {
  buildCallDataClaim,
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
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

    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      claimAccount.execute(
        [
          {
            contractAddress: "0x1",
            calldata: [buildCallDataClaim(claim), receiver],
            entrypoint: "claim_internal",
          },
        ],
        undefined,
        { skipValidate: false },
      ),
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
      claimAccount.execute(factory.populateTransaction.get_dust(claim, receiver), undefined, { skipValidate: false }),
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
        factory.populateTransaction.claim_internal(buildCallDataClaim(claim), receiver),
        factory.populateTransaction.claim_internal(buildCallDataClaim(claim), receiver),
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
