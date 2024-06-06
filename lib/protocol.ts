import { Contract } from "starknet";
import { deployer, manager } from ".";

const cache: Record<string, Contract> = {};

export async function setupGiftProtocol(): Promise<{
  factory: Contract;
  claimAccountClassHash: string;
}> {
  const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
  const cachedFactory = cache["GiftFactory"];
  if (cachedFactory) {
    return { factory: cachedFactory, claimAccountClassHash };
  }
  const factory = await manager.deployContract("GiftFactory", {
    unique: true,
    constructorCalldata: [claimAccountClassHash, deployer.address],
  });
  cache["GiftFactory"] = factory;
  return { factory, claimAccountClassHash };
}
