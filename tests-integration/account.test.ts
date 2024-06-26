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

describe("Claim Account", function () {
  it(`Test only protocol can call validate`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift } = await defaultDepositTestSetup({ factory });
    const claimAddress = calculateEscrowAddress(gift);

    await expectRevertWithErrorMessage("gift-acc/only-protocol", () =>
      deployer.execute([{ contractAddress: claimAddress, calldata: [0x0], entrypoint: "__validate__" }]),
    );
  });

  it(`Test only protocol can call execute`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift } = await defaultDepositTestSetup({ factory });
    const claimAddress = calculateEscrowAddress(gift);

    await expectRevertWithErrorMessage("gift-acc/only-protocol", () =>
      deployer.execute([{ contractAddress: claimAddress, calldata: [0x0], entrypoint: "__execute__" }]),
    );
  });

  it(`Test escrow contract cant call another contract`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await expectRevertWithErrorMessage("gift-acc/invalid-call-to", () =>
      claimInternal({
        gift: gift,
        receiver,
        giftPrivateKey: giftPrivateKey,
        details: { skipValidate: false },
        overrides: { callToAddress: "0x2" },
      }),
    );
  });

  it(`Test escrow contract can only call 'claim_internal'`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });

    const EscrowAccount = getEscrowAccount(gift, giftPrivateKey);

    await expectRevertWithErrorMessage("gift-acc/invalid-call-selector", () =>
      EscrowAccount.execute(
        [{ contractAddress: EscrowAccount.address, calldata: [], entrypoint: "execute_action" }],
        undefined,
        { skipValidate: false },
      ),
    );
  });

  it(`Test escrow contract cant perform a multicall`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const EscrowAccount = getEscrowAccount(gift, giftPrivateKey);
    await expectRevertWithErrorMessage("gift-acc/invalid-call-len", () =>
      EscrowAccount.execute(
        [
          { contractAddress: EscrowAccount.address, calldata: [], entrypoint: "execute_action" },
          { contractAddress: EscrowAccount.address, calldata: [], entrypoint: "execute_action" },
        ],
        undefined,
        { skipValidate: false },
      ),
    );
  });

  it(`Test cannot call 'claim_internal' twice`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift: gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    // double gift
    await claimInternal({ gift: gift, receiver, giftPrivateKey: giftPrivateKey });
    await expectRevertWithErrorMessage("gift-acc/invalid-gift-nonce", () =>
      claimInternal({ gift: gift, receiver, giftPrivateKey: giftPrivateKey, details: { skipValidate: false } }),
    );
  });
});
