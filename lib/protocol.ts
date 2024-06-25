import { Contract, byteArray, uint256 } from "starknet";
import { deployer, manager } from ".";

export const protocolCache: Record<string, Contract> = {};

export async function deployMockERC20(): Promise<Contract> {
  if (protocolCache["MockERC20"]) {
    return protocolCache["MockERC20"];
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
  protocolCache["MockERC20"] = mockERC20;
  return mockERC20;
}

export async function setupGiftProtocol(): Promise<{
  factory: Contract;
  claimAccountClassHash: string;
  accountImplementationClassHash: string;
}> {
  const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
  const accountImplementationClassHash = await manager.declareLocalContract("ClaimAccountImpl");
  const cachedFactory = protocolCache["GiftFactory"];
  if (cachedFactory) {
    return { factory: cachedFactory, claimAccountClassHash, accountImplementationClassHash };
  }
  const factory = await manager.deployContract("GiftFactory", {
    unique: true,
    constructorCalldata: [claimAccountClassHash, accountImplementationClassHash, deployer.address],
  });

  protocolCache["GiftFactory"] = factory;
  return { factory, claimAccountClassHash, accountImplementationClassHash };
}
