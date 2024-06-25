import {
  calculateClaimAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  expectRevertWithErrorMessage,
  getClaimAccount,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Claim Account", function () {
  it(`Test only protocol can call validate`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup({ factory });
    const claimAddress = calculateClaimAddress(claim);

    await expectRevertWithErrorMessage("gift-acc/only-protocol", () =>
      deployer.execute([{ contractAddress: claimAddress, calldata: [0x0], entrypoint: "__validate__" }]),
    );
  });

  it(`Test only protocol can call execute`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup({ factory });
    const claimAddress = calculateClaimAddress(claim);

    await expectRevertWithErrorMessage("gift-acc/only-protocol", () =>
      deployer.execute([{ contractAddress: claimAddress, calldata: [0x0], entrypoint: "__execute__" }]),
    );
  });

  it(`Test claim contract cant call another contract`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      claimInternal({
        claim,
        receiver,
        claimPrivateKey,
        details: { skipValidate: false },
        overrides: { callToAddress: "0x2" },
      }),
    );
  });

  it(`Test claim contract can only call 'claim_internal'`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });

    const claimAccount = getClaimAccount(claim, claimPrivateKey);

    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () =>
      claimAccount.execute(
        [{ contractAddress: claimAccount.address, calldata: [], entrypoint: "execute_action" }],
        undefined,
        { skipValidate: false },
      ),
    );
  });

  it(`Test claim contract cant perform a multicall`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const claimAccount = getClaimAccount(claim, claimPrivateKey);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-len", () =>
      claimAccount.execute(
        [
          { contractAddress: claimAccount.address, calldata: [], entrypoint: "execute_action" },
          { contractAddress: claimAccount.address, calldata: [], entrypoint: "execute_action" },
        ],
        undefined,
        { skipValidate: false },
      ),
    );
  });

  it(`Test cannot call 'claim_internal' twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    // double claim
    await claimInternal({ claim, receiver, claimPrivateKey });
    await expectRevertWithErrorMessage("gift-acc/invalid-claim-nonce", () =>
      claimInternal({ claim, receiver, claimPrivateKey, details: { skipValidate: false } }),
    );
  });
});
