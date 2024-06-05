import "dotenv/config";
import { Account, RpcProvider } from "starknet";

// connect provider
const provider = new RpcProvider({ nodeUrl: process.env.RPC_PROVIDER });
const account = new Account(provider, process.env.ACCOUNT);

async function monitorNonce() {
  let nonce = await account.getNonce("latest");
  console.log(`${getFormattedDate()} Nonce: ${nonce}`);
}

function getFormattedDate() {
  return "[" + new Date().toLocaleTimeString() + "]";
}

setInterval(monitorNonce, 1000);
