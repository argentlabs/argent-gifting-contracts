import { CallData } from "starknet";
import {
  LongSigner,
  WrongSigner,
  buildGiftCallData,
  calculateEscrowAddress,
  claimInternal,
  defaultDepositTestSetup,
  deployer,
  executeActionOnAccount,
  expectRevertWithErrorMessage,
  getEscrowAccount,
  manager,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";
describe("Escrow Account", function () {
  it(`Test only protocol can call validate`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const escrowAddress = calculateEscrowAddress(gift);

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

  it(`Test escrow can only do whitelisted lib calls`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const minimalCallData = CallData.compile([buildGiftCallData(gift)]);

    await expectRevertWithErrorMessage("escr-lib/invalid-selector", () =>
      deployer.execute(executeActionOnAccount("claim_internal", calculateEscrowAddress(gift), minimalCallData)),
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

  it(`Long signature shouldn't be accepted`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    const escrowAccount = getEscrowAccount(gift, giftPrivateKey);
    escrowAccount.signer = new LongSigner();
    await expectRevertWithErrorMessage("escrow/invalid-signature-len", () =>
      escrowAccount.execute([
        {
          contractAddress: escrowAccount.address,
          calldata: [buildGiftCallData(gift), receiver],
          entrypoint: "claim_internal",
        },
      ]),
    );
  });

  it(`Wrong signature shouldn't be accepted`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    const escrowAccount = getEscrowAccount(gift, giftPrivateKey);
    escrowAccount.signer = new WrongSigner();
    await expectRevertWithErrorMessage("escrow/invalid-signature", () =>
      escrowAccount.execute([
        {
          contractAddress: escrowAccount.address,
          calldata: [buildGiftCallData(gift), receiver],
          entrypoint: "claim_internal",
        },
      ]),
    );
  });

  it(`Shouldn't be possible to instantiate the library account`, async function () {
    const classHash = await manager.declareLocalContract("EscrowLibrary");

    await expectRevertWithErrorMessage("escr-lib/instance-not-recommend", () => deployer.deployContract({ classHash }));
  });
});
