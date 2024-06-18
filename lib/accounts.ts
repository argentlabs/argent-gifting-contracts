import { Account, Call, CallData, RPC, uint256 } from "starknet";
import { manager } from "./manager";
import { ethAddress, strkAddress } from "./tokens";

export const deployer = (() => {
  if (manager.isDevnet) {
    const devnetAddress = "0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691";
    const devnetPrivateKey = "0x71d7bb07b9a64f6f78ac4c816aff4da9";
    return new Account(manager, devnetAddress, devnetPrivateKey, undefined, RPC.ETransactionVersion.V2);
  }
  const address = process.env.ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;
  if (address && privateKey) {
    return new Account(manager, address, privateKey, undefined, RPC.ETransactionVersion.V2);
  }
  throw new Error("Missing deployer address or private key, please set ADDRESS and PRIVATE_KEY env variables.");
})();

// export const genericAccount = (() => {
//   if (manager.isDevnet) {
//     const devnetAddress = "0x78662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1";
//     const devnetPrivateKey = "0xe1406455b7d66b1690803be066cbe5e";
//     return new Account(manager, devnetAddress, devnetPrivateKey, undefined, RPC.ETransactionVersion.V2);
//   }
//   throw new Error("Only works in devnet.");
// })();

export const deployerV3 = setDefaultTransactionVersionV3(deployer);

export function setDefaultTransactionVersion(account: Account, newVersion: boolean): Account {
  const newDefaultVersion = newVersion ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  if (account.transactionVersion === newDefaultVersion) {
    return account;
  }
  return new Account(account, account.address, account.signer, account.cairoVersion, newDefaultVersion);
}

export function setDefaultTransactionVersionV3(account: Account): Account {
  return setDefaultTransactionVersion(account, true);
}

console.log("Deployer:", deployer.address);

export async function fundAccountCall(
  recipient: string,
  amount: number | bigint,
  token: "ETH" | "STRK",
): Promise<Call | undefined> {
  if (amount <= 0n) {
    return;
  }
  const contractAddress = { ETH: ethAddress, STRK: strkAddress }[token];
  if (!contractAddress) {
    throw new Error(`Unsupported token ${token}`);
  }
  const calldata = CallData.compile([recipient, uint256.bnToUint256(amount)]);
  return { contractAddress, calldata, entrypoint: "transfer" };
}
