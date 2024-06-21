import { hash } from "starknet";
import {
  deployer,
  expectEvent,
  expectRevertWithErrorMessage,
  genericAccount,
  manager,
  setupGiftProtocol,
} from "../lib";

const MIN_SECURITY_PERIOD = 604800; // 7 * 24 * 60 * 60;  // 7 day

///  Time window during which the upgrade can be performed
const VALID_WINDOW_PERIOD = 604800; // 7 * 24 * 60 * 60;  // 7 days

const CURRENT_TIME = 1718898082;

describe("Test Factory Upgrade", function () {
  it.only("Upgrade", async function () {
    const { factory } = await setupGiftProtocol();
    const newFactoryClassHash = await manager.declareFixtureContract("GiftFactoryUpgrade");

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    await factory.propose_upgrade(newFactoryClassHash, []);

    await factory.get_upgrade_ready_at().should.eventually.equal(BigInt(CURRENT_TIME + MIN_SECURITY_PERIOD));
    await factory.get_proposed_implementation().should.eventually.equal(BigInt(newFactoryClassHash));

    await manager.increaseTime(MIN_SECURITY_PERIOD + 1);
    await factory.upgrade([]);

    // reset storage
    await factory.get_proposed_implementation().should.eventually.equal(0n);
    await factory.get_upgrade_ready_at().should.eventually.equal(0n);

    await manager.getClassHashAt(factory.address).should.eventually.equal(newFactoryClassHash);

    const newFactory = await manager.loadContract(factory.address, newFactoryClassHash);
    await newFactory.get_num().should.eventually.equal(1n);
  });

  it.only("Propose Upgrade: implementation-null", async function () {
    const { factory } = await setupGiftProtocol();
    const zeroClassHash = "0x0";

    factory.connect(deployer);
    expectRevertWithErrorMessage("upgrade/new-implementation-null", () => factory.propose_upgrade(zeroClassHash, []));
  });

  it.only("Propose Upgrade: only-owner", async function () {
    const { factory } = await setupGiftProtocol();
    const zeroClassHash = "0x0";

    factory.connect(genericAccount);
    expectRevertWithErrorMessage("Caller is not the owner", () => factory.propose_upgrade(zeroClassHash, []));
  });

  it.only("Propose Upgrade: replace pending implementation /w events", async function () {
    const { factory } = await setupGiftProtocol();
    const newClassHash = 12345n;
    const replacementClassHash = 54321n;
    const calldata: any[] = [];

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    const { transaction_hash: tx1 } = await factory.propose_upgrade(newClassHash, calldata);
    await factory.get_proposed_implementation().should.eventually.equal(newClassHash);

    const readyAt = await factory.get_upgrade_ready_at();
    const calldataHash = hash.computePoseidonHashOnElements(calldata);

    await expectEvent(tx1, {
      from_address: factory.address,
      eventName: "UpgradeProposed",
      data: [newClassHash.toString(), readyAt.toString(), calldataHash],
    });

    const { transaction_hash: tx2 } = await factory.propose_upgrade(replacementClassHash, calldata);
    await factory.get_proposed_implementation().should.eventually.equal(replacementClassHash);

    await expectEvent(tx2, {
      from_address: factory.address,
      eventName: "UpgradeCancelled",
      data: [newClassHash.toString()],
    });
  });

  it.only("Cancel Upgrade /w events", async function () {
    const { factory } = await setupGiftProtocol();
    const newClassHash = 12345n;
    const calldata: any[] = [];

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    await factory.propose_upgrade(newClassHash, calldata);

    const { transaction_hash } = await factory.cancel_upgrade();

    await factory.get_proposed_implementation().should.eventually.equal(0n);
    await factory.get_upgrade_ready_at().should.eventually.equal(0n);

    await expectEvent(transaction_hash, {
      from_address: factory.address,
      eventName: "UpgradeCancelled",
      data: [newClassHash.toString()],
    });
  });

  it.only("Cancel Upgrade: No new implementation", async function () {
    const { factory } = await setupGiftProtocol();

    factory.connect(deployer);
    expectRevertWithErrorMessage("upgrade/no-new-implementation", () => factory.cancel_upgrade());
  });

  // it.only("Cancel Upgrade /w events", async function () {
  //   const { factory } = await setupGiftProtocol();
  //   const newClassHash = 12345n;
  //   const calldata: any[] = [];

  //   await manager.setTime(CURRENT_TIME);
  //   factory.connect(deployer);
  //   await factory.propose_upgrade(newClassHash, calldata);

  //   const { transaction_hash } = await factory.cancel_upgrade();

  //   await expectEvent(transaction_hash, {
  //     from_address: factory.address,
  //     eventName: "UpgradeCancelled",
  //     data: [newClassHash.toString()],
  //   });
  // });
});
