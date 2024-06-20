import { Contract, byteArray, uint256 } from "starknet";
import { deployer, manager } from ".";

const cache: Record<string, Contract> = {};

export async function deployMockERC20(): Promise<Contract> {
  if (cache["MockERC20"]) {
    return cache["MockERC20"];
  }
  const mockERC20 = await manager.deployContract("MockERC20", {
    unique: true,
    constructorCalldata: [
      byteArray.byteArrayFromString("USDC"),
      byteArray.byteArrayFromString("USDC"),
      uint256.bnToUint256(100e18),
      deployer.address,
      deployer.address,
    ],
  });
  cache["MockERC20"] = mockERC20;
  return mockERC20;
}

export async function setupGiftProtocol(): Promise<{
  factory: Contract;
  claimAccountClassHash: string;
  accountImplementationClassHash: string;
}> {
  const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
  const accountImplementationClassHash = await manager.declareLocalContract("ClaimAccountImpl");
  const cachedFactory = cache["GiftFactory"];
  if (cachedFactory) {
    return { factory: cachedFactory, claimAccountClassHash, accountImplementationClassHash };
  }
  const factory = await manager.deployContract("GiftFactory", {
    unique: true,
    constructorCalldata: [claimAccountClassHash, accountImplementationClassHash, deployer.address],
  });
  cache["GiftFactory"] = factory;
  return { factory, claimAccountClassHash, accountImplementationClassHash };
}
