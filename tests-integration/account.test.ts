import {
  calculateEscrowAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  expectRevertWithErrorMessage,
  getEscrowAccount,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Escrow Account", function () {
  it(`Test only protocol can call validate`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const escrowAddress = calculateEscrowAddress(gift);
// This says validate but calls execute?
    await expectRevertWithErrorMessage("escrow/only-protocol", () =>
      deployer.execute([{ contractAddress: escrowAddress, calldata: [0x0], entrypoint: "__validate__" }]),
    );
  });

  it(`Test only protocol can call execute`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const escrowAddress = calculateEscrowAddress(gift);

    await expectRevertWithErrorMessage("escrow/only-protocol", () =>
      deployer.execute([{ contractAddress: escrowAddress, calldata: [0x0], entrypoint: "__execute__" }]),
    );
  });

  it(`Test escrow contract cant call another contract`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await expectRevertWithErrorMessage("escrow/invalid-call-to", () =>
      claimInternal({
        gift,
        receiver,
        giftPrivateKey: giftPrivateKey,
        details: { skipValidate: false },
        overrides: { callToAddress: "0x2" },
      }),
    );
  });

  it(`Test escrow contract can only call 'escrow_internal'`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });

    const escrowAccount = getEscrowAccount(gift, giftPrivateKey);

    await expectRevertWithErrorMessage("escrow/invalid-call-selector", () =>
      escrowAccount.execute(
        [{ contractAddress: escrowAccount.address, calldata: [], entrypoint: "execute_action" }],
        undefined,
        { skipValidate: false },
      ),
    );
  });

  it(`Test escrow contract cant perform a multicall`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const escrowAccount = getEscrowAccount(gift, giftPrivateKey);
    await expectRevertWithErrorMessage("escrow/invalid-call-len", () =>
      escrowAccount.execute(
        [
          { contractAddress: escrowAccount.address, calldata: [], entrypoint: "execute_action" },
          { contractAddress: escrowAccount.address, calldata: [], entrypoint: "execute_action" },
        ],
        undefined,
        { skipValidate: false },
      ),
    );
  });

  it(`Test cannot call 'claim_internal' twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    // double claim
    await claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey });
    await expectRevertWithErrorMessage("escrow/invalid-gift-nonce", () =>
      claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey, details: { skipValidate: false } }),
    );
  });
});
