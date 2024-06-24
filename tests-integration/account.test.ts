import {
  buildCallDataClaim,
  claimInternal,
  defaultDepositTestSetup,
  expectRevertWithErrorMessage,
  getClaimAccount,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Claim Account", function () {
  it(`Test only protocol can call validate`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, claimAccountClassHash });

    const claimAccount = getClaimAccount(claim, claimPrivateKey);
    const claimContract = await manager.loadContract(claimAccount.address);

    claimContract.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/only-protocol", () => claimContract.__validate__([]));
  });

  it(`Test claim contract cant call another contract`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, claimAccountClassHash });
    const receiver = randomReceiver();

    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      claimInternal({
        claim,
        receiver,
        claimPrivateKey,
        details: { skipValidate: false },
        overrides: { factoryAddress: "0x2" },
      }),
    );
  });

  it(`Test claim contract can only call 'claim_internal'`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, claimAccountClassHash });
    const receiver = randomReceiver();

    const claimAccount = getClaimAccount(claim, claimPrivateKey);

    factory.connect(claimAccount);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () =>
      claimAccount.execute(factory.populateTransaction.get_dust(claim, receiver), undefined, { skipValidate: false }),
    );
  });

  it(`Test claim contract cant preform a multicall`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, claimAccountClassHash });
    const receiver = randomReceiver();

    const claimAccount = getClaimAccount(claim, claimPrivateKey);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-len", () =>
      claimAccount.execute([
        factory.populateTransaction.claim_internal(buildCallDataClaim(claim), receiver),
        factory.populateTransaction.claim_internal(buildCallDataClaim(claim), receiver),
      ]),
    );
  });

  it(`Test cannot call 'claim_internal' twice`, async function () {
    const { factory, claimAccountClassHash } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory, claimAccountClassHash });
    const receiver = randomReceiver();

    // double claim
    await claimInternal({ claim, receiver, claimPrivateKey });
    await expectRevertWithErrorMessage("gift-acc/invalid-claim-nonce", () =>
      claimInternal({ claim, receiver, claimPrivateKey, details: { skipValidate: false } }),
    );
  });
});
