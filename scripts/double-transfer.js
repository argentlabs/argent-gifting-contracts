import "dotenv/config";
import { Account, Contract, RpcProvider } from "starknet";

// connect provider
const provider = new RpcProvider({ nodeUrl: process.env.RPC_PROVIDER });
const account = new Account(provider, process.env.ACCOUNT, process.env.PRIVATE_KEY);
const ethAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const ethClassHash = "0x05ffbcfeb50d200a0677c48a129a11245a3fc519d1d98d76882d1c9a1b19c6ed";
const receiver = "0x01a10f22c98BA5Fb02374089EAA9c62deaced318a909c264a5270B2844CCb37d";
const amount = 50;
const maxFee = 1e15;

// setInterval(getNonce, 3000);

const ethContract = await loadContract(ethAddress, ethClassHash);

let nonce = await getNonce();

doSendTx(nonce, amount, "0");
doSendTx(nonce, amount + 1, "0b");
doSendTx(nonce + 1, amount + 3, "+1");
doSendTx(nonce + 1, amount + 4, "+1b");
doSendTx(nonce + 2, amount + 5, "+2");
doSendTx(nonce + 2, amount + 6, "+2b");

function doSendTx(nonce, amount, name) {
  account
    .execute(ethContract.populateTransaction.transfer(receiver, amount), undefined, {
      skipValidate: true,
      maxFee,
      nonce,
    })
    .then(async (tx) => handle(name, tx));
}
async function handle(name, tx) {
  console.log(`${getFormattedDate()} ${name}`);
  getNonce();
  console.log(tx);
  try {
    const x = await provider.waitForTransaction(tx.transaction_hash);
    console.log(`${getFormattedDate()} result ${name}`);
    console.log(x);
    getNonce();
  } catch (error) {
    console.log(`${getFormattedDate()} error ${name}`);
    console.log(error);
    getNonce();
  }
}

function getFormattedDate() {
  return "[" + new Date().toLocaleTimeString() + "]";
}

async function getNonce() {
  let nonce = await account.getNonce();
  console.log(`${getFormattedDate()} Nonce: ${nonce}`);
  return Number(nonce);
}

async function loadContract(contractAddress) {
  const { abi } = await provider.getClassAt(contractAddress);
  return new Contract(
    abi,
    contractAddress,
    provider,
    "0x05ffbcfeb50d200a0677c48a129a11245a3fc519d1d98d76882d1c9a1b19c6ed",
  );
}
