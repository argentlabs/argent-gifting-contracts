import { deployer, manager, setupGiftProtocol } from "../lib";

const MIN_SECURITY_PERIOD = 172800; // 7 * 24 * 60 * 60;  // 7 day

///  Time window during which the upgrade can be performed
const VALID_WINDOW_PERIOD = 604800; // 7 * 24 * 60 * 60;  // 7 days

const CURRENT_TIME = 100;

describe("Test  Factory Upgrade", function () {
  it("Upgrade", async function () {
    const { factory } = await setupGiftProtocol();
    const newFactoryClassHash = await manager.declareFixtureContract("GiftFactoryUpgrade");

    factory.connect(deployer);
    await factory.propose_upgrade(newFactoryClassHash);

    await manager.setTime(CURRENT_TIME);
    await factory.get_upgrade_ready_at().should.eventually.equal(BigInt(CURRENT_TIME + MIN_SECURITY_PERIOD));
    await factory.get_proposed_implementation().should.eventually.equal(BigInt(newFactoryClassHash));

    await manager.setTime(CURRENT_TIME + MIN_SECURITY_PERIOD + 1);
    await factory.upgrade([]);

    // reset storage
    await factory.get_proposed_implementation().should.eventually.equal(0n);
    await factory.get_upgrade_ready_at().should.eventually.equal(0n);

    await manager.getClassHashAt(factory.address).should.eventually.equal(BigInt(newFactoryClassHash));

    await factory.get_num().should.eventually.equal(1n);
  });
});
