import { CallData, hash, num } from "starknet";
import {
  deployer,
  devnetAccount,
  expectEvent,
  expectRevertWithErrorMessage,
  manager,
  protocolCache,
  setupGiftProtocol,
} from "../lib";
// Time window which must pass before the upgrade can be performed
const MIN_SECURITY_PERIOD = 7n * 24n * 60n * 60n; // 7 day

//  Time window during which the upgrade can be performed
const VALID_WINDOW_PERIOD = 7n * 24n * 60n * 60n; // 7 day

const CURRENT_TIME = 1718898082n;

describe("Test Factory Upgrade", function () {
  it("Upgrade", async function () {
    const { factory } = await setupGiftProtocol();
    const newFactoryClassHash = await manager.declareLocalContract("FutureFactory");
    const calldata: any[] = [];

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    await factory.propose_upgrade(newFactoryClassHash, calldata);

    await factory.get_pending_upgrade().should.eventually.deep.equal({
      ready_at: CURRENT_TIME + MIN_SECURITY_PERIOD,
      implementation: num.toBigInt(newFactoryClassHash),
      calldata_hash: BigInt(hash.computePoseidonHashOnElements(calldata)),
    });

    await manager.setTime(CURRENT_TIME + MIN_SECURITY_PERIOD + 1n);
    await factory.upgrade(calldata);

    // check storage was reset
    await factory.get_pending_upgrade().should.eventually.deep.equal({
      ready_at: 0n,
      implementation: 0n,
      calldata_hash: 0n,
    });

    await manager.getClassHashAt(factory.address).should.eventually.equal(newFactoryClassHash);

    // test new factory has new method
    const newFactory = await manager.loadContract(factory.address, newFactoryClassHash);
    newFactory.connect(deployer);
    await newFactory.get_num().should.eventually.equal(1n);

    // we can't call the perform_upgrade method directly
    await expectRevertWithErrorMessage("upgrade/only-during-upgrade", () =>
      factory.perform_upgrade(newFactoryClassHash, []),
    );

    // clear deployment cache
    delete protocolCache["GiftFactory"];
  });

  it("cannot downgrade", async function () {
    const { factory } = await setupGiftProtocol();
    const oldFactoryClassHash = await manager.getClassHashAt(factory.address);
    const calldata: any[] = [];

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    await factory.propose_upgrade(oldFactoryClassHash, calldata);

    await manager.setTime(CURRENT_TIME + MIN_SECURITY_PERIOD + 1n);
    await expectRevertWithErrorMessage("gift-fac/downgrade-not-allowed", () => factory.upgrade([]));
  });

  it("only-owner", async function () {
    const { factory } = await setupGiftProtocol();
    const newFactoryClassHash = "0x1";

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    await factory.propose_upgrade(newFactoryClassHash, []);

    await manager.setTime(CURRENT_TIME + MIN_SECURITY_PERIOD + 1n);
    factory.connect(devnetAccount());
    await expectRevertWithErrorMessage("Caller is not the owner", () => factory.upgrade([]));
  });

  it("no calls to perform_upgrade", async function () {
    const { factory } = await setupGiftProtocol();
    const newFactoryClassHash = "0x1";
    await expectRevertWithErrorMessage("upgrade/only-during-upgrade", () =>
      factory.perform_upgrade(newFactoryClassHash, []),
    );
  });

  it("Invalid Calldata", async function () {
    const { factory } = await setupGiftProtocol();
    const newFactoryClassHash = "0x1";
    const calldata = [1, 2, 3];

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    await factory.propose_upgrade(newFactoryClassHash, calldata);

    await manager.setTime(CURRENT_TIME + MIN_SECURITY_PERIOD + 1n);
    const newCalldata = [4, 5, 6];
    await expectRevertWithErrorMessage("upgrade/invalid-calldata", () => factory.upgrade(newCalldata));
  });

  it("Too Early", async function () {
    const { factory } = await setupGiftProtocol();
    const newFactoryClassHash = "0x1";

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    await factory.propose_upgrade(newFactoryClassHash, []);

    await manager.setTime(CURRENT_TIME + MIN_SECURITY_PERIOD - 1n);
    await expectRevertWithErrorMessage("upgrade/too-early", () => factory.upgrade([]));
  });

  it("Too Late", async function () {
    const { factory } = await setupGiftProtocol();
    const newFactoryClassHash = "0x1";

    await manager.setTime(CURRENT_TIME);
    factory.connect(deployer);
    await factory.propose_upgrade(newFactoryClassHash, []);

    const pendingUpgrade = await factory.get_pending_upgrade();
    const readyAt = pendingUpgrade.ready_at;
    await manager.setTime(CURRENT_TIME + readyAt + VALID_WINDOW_PERIOD);
    await expectRevertWithErrorMessage("upgrade/upgrade-too-late", () => factory.upgrade([]));
  });

  describe("Propose Upgrade", function () {
    it("implementation-null", async function () {
      const { factory } = await setupGiftProtocol();
      const zeroClassHash = "0x0";

      factory.connect(deployer);
      await expectRevertWithErrorMessage("upgrade/new-implementation-null", () =>
        factory.propose_upgrade(zeroClassHash, []),
      );
    });

    it("only-owner", async function () {
      const { factory } = await setupGiftProtocol();
      const newFactoryClassHash = "0x1";

      factory.connect(devnetAccount());
      await expectRevertWithErrorMessage("Caller is not the owner", () =>
        factory.propose_upgrade(newFactoryClassHash, []),
      );
    });

    it("replace pending implementation /w events", async function () {
      const { factory } = await setupGiftProtocol();
      const newClassHash = 12345n;
      const replacementClassHash = 54321n;
      const calldata: any[] = [123n];

      await manager.setTime(CURRENT_TIME);
      factory.connect(deployer);
      const { transaction_hash: tx1 } = await factory.propose_upgrade(newClassHash, calldata);

      const expectedPendingUpgrade = {
        ready_at: CURRENT_TIME + MIN_SECURITY_PERIOD,
        implementation: num.toBigInt(newClassHash),
        calldata_hash: BigInt(hash.computePoseidonHashOnElements(calldata)),
      };
      await factory.get_pending_upgrade().should.eventually.deep.equal(expectedPendingUpgrade);

      await expectEvent(tx1, {
        from_address: factory.address,
        eventName: "UpgradeProposed",
        data: CallData.compile([newClassHash.toString(), expectedPendingUpgrade.ready_at.toString(), calldata]),
      });

      const { transaction_hash: tx2 } = await factory.propose_upgrade(replacementClassHash, calldata);

      await factory.get_pending_upgrade().should.eventually.deep.equal({
        ...expectedPendingUpgrade,
        implementation: num.toBigInt(replacementClassHash),
      });

      await expectEvent(tx2, {
        from_address: factory.address,
        eventName: "UpgradeCancelled",
        data: [
          newClassHash.toString(),
          expectedPendingUpgrade.ready_at.toString(),
          expectedPendingUpgrade.calldata_hash.toString(),
        ],
      });
    });
  });

  describe("Cancel Upgrade", function () {
    it("Normal flow /w events", async function () {
      const { factory } = await setupGiftProtocol();
      const newClassHash = 12345n;
      const calldata: any[] = [];

      await manager.setTime(CURRENT_TIME);
      factory.connect(deployer);
      await factory.propose_upgrade(newClassHash, calldata);

      const { transaction_hash } = await factory.cancel_upgrade();

      await expectEvent(transaction_hash, {
        from_address: factory.address,
        eventName: "UpgradeCancelled",
        data: [
          newClassHash.toString(),
          (CURRENT_TIME + MIN_SECURITY_PERIOD).toString(),
          BigInt(hash.computePoseidonHashOnElements(calldata)).toString(),
        ],
      });

      // check storage was reset
      await factory.get_pending_upgrade().should.eventually.deep.equal({
        ready_at: 0n,
        implementation: 0n,
        calldata_hash: 0n,
      });
    });

    it("No new implementation", async function () {
      const { factory } = await setupGiftProtocol();

      factory.connect(deployer);
      await expectRevertWithErrorMessage("upgrade/no-pending-upgrade", () => factory.cancel_upgrade());
    });

    it("Only Owner", async function () {
      const { factory } = await setupGiftProtocol();

      factory.connect(devnetAccount());
      await expectRevertWithErrorMessage("Caller is not the owner", () => factory.cancel_upgrade());
    });
  });
});
