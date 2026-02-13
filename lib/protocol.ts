import { Account, byteArray, uint256 } from "starknet";
import { deployer, manager, type Erc20Contract } from "starknet-dev-toolkit";
import type { GiftFactoryContract } from "./contract-types.js";

let cachedMockERC20: Erc20Contract | undefined;
let cachedFactory: GiftFactoryContract | undefined;

export function devnetAccount(): Account {
  const devnetAddress = "0x78662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1";
  const devnetPrivateKey = "0xe1406455b7d66b1690803be066cbe5e";
  return new Account({ provider: manager, address: devnetAddress, signer: devnetPrivateKey });
}

export async function deployMockERC20(): Promise<Erc20Contract> {
  if (cachedMockERC20) return cachedMockERC20;

  // manager.deployContract returns Contract, cast once here
  cachedMockERC20 = (await manager.deployContract("MockERC20", {
    unique: true,
    constructorCalldata: [
      byteArray.byteArrayFromString("USDC"),
      byteArray.byteArrayFromString("USDC"),
      uint256.bnToUint256(100e18),
      deployer.address,
      deployer.address,
    ],
  })) as Erc20Contract;
  return cachedMockERC20;
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
  cachedFactory = (await manager.deployContract("GiftFactory", {
    unique: true,
    constructorCalldata: [escrowAccountClassHash, escrowLibraryClassHash, deployer.address],
  })) as GiftFactoryContract;

  return { factory: cachedFactory, escrowAccountClassHash, escrowLibraryClassHash };
}

export function resetProtocolCache(): void {
  cachedFactory = undefined;
  cachedMockERC20 = undefined;
}
