import { Account, byteArray, uint256 } from "starknet";
import { deployer, getPredeployedDevnetAccount, manager, type Erc20Contract } from "starknet-dev-toolkit";
import type { GiftFactoryContract } from "./contract-types.js";

let cachedMockERC20: Erc20Contract | undefined;
let cachedFactory: GiftFactoryContract | undefined;

export async function devnetAccount(): Promise<Account> {
  const { address, privateKey } = await getPredeployedDevnetAccount(manager, deployer.address);
  return new Account({ provider: manager, address, signer: privateKey });
}

export async function deployMockERC20(): Promise<Erc20Contract> {
  if (cachedMockERC20) return cachedMockERC20;

  return await manager.declareAndDeployContract("MockERC20", {
    unique: true,
    constructorCalldata: [
      byteArray.byteArrayFromString("USDC"),
      byteArray.byteArrayFromString("USDC"),
      uint256.bnToUint256(100e18),
      deployer.address,
      deployer.address,
    ],
  });
}

export async function setupGiftProtocol(): Promise<{
  factory: GiftFactoryContract;
  escrowAccountClassHash: string;
  escrowLibraryClassHash: string;
}> {
  const escrowAccountClassHash = await manager.declareLocalContract("EscrowAccount");
  const escrowLibraryClassHash = await manager.declareLocalContract("EscrowLibrary");

  if (cachedFactory) {
    return { factory: cachedFactory, escrowAccountClassHash, escrowLibraryClassHash };
  }

  // manager.deployContract returns Contract, cast once here
  cachedFactory = (await manager.declareAndDeployContract("GiftFactory", {
    unique: true,
    constructorCalldata: [escrowAccountClassHash, escrowLibraryClassHash, deployer.address],
  })) as GiftFactoryContract;

  return { factory: cachedFactory, escrowAccountClassHash, escrowLibraryClassHash };
}

export function resetProtocolCache(): void {
  cachedFactory = undefined;
  cachedMockERC20 = undefined;
}
