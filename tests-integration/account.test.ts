import { CallData } from "starknet";
import { deployer, expectRevertWithErrorMessage, manager } from "starknet-dev-toolkit";
import { claimInternal, EscrowAction, executeActionOnAccount, getEscrowAccount, randomReceiver } from "../lib/claim.js";
import { defaultDepositTestSetup } from "../lib/deposit.js";
import { setupGiftProtocol } from "../lib/protocol.js";
import { LongSigner, WrongSigner } from "../lib/signers.js";
describe("Escrow Account", function () {
  it(`Test only protocol can call validate`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const escrowAddress = gift.escrowAddress();

    await expectRevertWithErrorMessage(
      "escrow/only-protocol",
      deployer.execute([{ contractAddress: escrowAddress, calldata: [0x0], entrypoint: "__validate__" }]),
    );
  });

  it(`Test escrow can only do whitelisted lib calls`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift } = await defaultDepositTestSetup({ factory });
    const minimalCallData = CallData.compile([gift.toCallData()]);

    await expectRevertWithErrorMessage(
      "escr-lib/invalid-selector",
      deployer.execute(executeActionOnAccount(EscrowAction.ClaimInternal, gift.escrowAddress(), minimalCallData)),
    );
  });

  it(`Test escrow contract cant call another contract`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await expectRevertWithErrorMessage(
      "escrow/invalid-call-to",
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

    await expectRevertWithErrorMessage(
      "escrow/invalid-call-selector",
      escrowAccount.execute([{ contractAddress: escrowAccount.address, calldata: [], entrypoint: "execute_action" }], {
        skipValidate: false,
      }),
    );
  });

  it(`Test escrow contract cant perform a multicall`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const escrowAccount = getEscrowAccount(gift, giftPrivateKey);
    await expectRevertWithErrorMessage(
      "escrow/invalid-call-len",
      escrowAccount.execute(
        [
          { contractAddress: escrowAccount.address, calldata: [], entrypoint: "execute_action" },
          { contractAddress: escrowAccount.address, calldata: [], entrypoint: "execute_action" },
        ],
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
    await expectRevertWithErrorMessage(
      "escrow/invalid-gift-nonce",
      claimInternal({ gift, receiver, giftPrivateKey: giftPrivateKey, details: { skipValidate: false } }),
    );
  });

  it(`Long signature shouldn't be accepted`, async function () {
    const { factory } = await setupGiftProtocol();
    const { gift, giftPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    const escrowAccount = getEscrowAccount(gift, giftPrivateKey);
    escrowAccount.signer = new LongSigner();
    await expectRevertWithErrorMessage(
      "escrow/invalid-signature-len",
      escrowAccount.execute([
        {
          contractAddress: escrowAccount.address,
          calldata: [gift.toCallData(), receiver],
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
    await expectRevertWithErrorMessage(
      "escrow/invalid-signature",
      escrowAccount.execute([
        {
          contractAddress: escrowAccount.address,
          calldata: [gift.toCallData(), receiver],
          entrypoint: "claim_internal",
        },
      ]),
    );
  });

  it(`Shouldn't be possible to instantiate the library account`, async function () {
    const classHash = await manager.declareLocalContract("EscrowLibrary");

    await expectRevertWithErrorMessage("escr-lib/instance-not-recommend", deployer.deployContract({ classHash }));
  });
});
