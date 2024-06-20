import { expect } from "chai";
import { CairoCustomEnum } from "starknet";
import {
  claimExternal,
  claimInternal,
  defaultDepositTestSetup,
  deployMockERC20,
  deployer,
  getClaimAccount,
  randomReceiver,
  setupGiftProtocol,
} from "../lib";

describe("Test gift status", function () {
  it(`GiftStatus - Ready (gift token == fee token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup({ factory });

    factory.connect(deployer);
    const statusEnum = (await factory.get_gift_status(claim)) as CairoCustomEnum;
    expect(statusEnum.activeVariant()).to.equal("Ready");
  });

  it(`GiftStatus - Ready (gift token != fee token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const mockErc = await deployMockERC20();
    const { claim } = await defaultDepositTestSetup({ factory, overrides: { giftTokenAddress: mockErc.address } });

    factory.connect(deployer);
    const statusEnum = (await factory.get_gift_status(claim)) as CairoCustomEnum;
    expect(statusEnum.activeVariant()).to.equal("Ready");
  });

  it(`GiftStatus - ClaimedOrCancelled (claim internal)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimInternal({ claim, receiver, claimPrivateKey });

    factory.connect(deployer);
    const statusEnum = (await factory.get_gift_status(claim)) as CairoCustomEnum;
    expect(statusEnum.activeVariant()).to.equal("ClaimedOrCancelled");
  });

  it(`GiftStatus - ClaimedOrCancelled (claim external)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimExternal({ claim, receiver, claimPrivateKey });

    factory.connect(deployer);
    const statusEnum = (await factory.get_gift_status(claim)) as CairoCustomEnum;
    expect(statusEnum.activeVariant()).to.equal("ClaimedOrCancelled");
  });

  it(`GiftStatus - ClaimedOrCancelled cancelled`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim } = await defaultDepositTestSetup({ factory });

    factory.connect(deployer);
    await factory.cancel(claim);
    const statusEnum = (await factory.get_gift_status(claim)) as CairoCustomEnum;
    expect(statusEnum.activeVariant()).to.equal("ClaimedOrCancelled");
  });

  // NOT SURE HOW TO TEST THIS:
  it.skip(`GiftStatus - ReadyExternalOnly (gift token == claim token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({ factory });
    const receiver = randomReceiver();

    await claimExternal({ claim, receiver, claimPrivateKey });

    factory.connect(deployer);
    const statusEnum = (await factory.get_gift_status(claim)) as CairoCustomEnum;
    expect(statusEnum.activeVariant()).to.equal("ReadyExternalOnly");
  });

  it.skip(`GiftStatus - ReadyExternalOnly (gift token != claim token)`, async function () {
    const { factory } = await setupGiftProtocol();
    const mockErc = await deployMockERC20();
    const { claim, claimPrivateKey } = await defaultDepositTestSetup({
      factory,
      overrides: { giftTokenAddress: mockErc.address },
    });

    const claimAccount = getClaimAccount(claim, claimPrivateKey);

    factory.connect(deployer);
    const statusEnum = (await factory.get_gift_status(claim)) as CairoCustomEnum;
    expect(statusEnum.activeVariant()).to.equal("ReadyExternalOnly");
  });
});
