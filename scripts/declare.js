import "dotenv/config";
import fs from "fs";
import { Account, RpcProvider, constants, json } from "starknet";

// connect provider
const provider = new RpcProvider({ nodeUrl: constants.NetworkName.SN_SEPOLIA });
const account0 = new Account(provider, process.env.ACCOUNT, process.env.PRIVATE_KEY);

// Declare Test contract in devnet
const compiledTestSierra = json.parse(
  fs.readFileSync("./target/dev/argent_gifting_EscrowAccount.contract_class.json").toString("ascii"),
);
const compiledTestCasm = json.parse(
  fs.readFileSync("./target/dev/argent_gifting_EscrowAccount.compiled_contract_class.json").toString("ascii"),
);
const declareResponse = await account0.declare({
  contract: compiledTestSierra,
  casm: compiledTestCasm,
});
console.log("Test Contract declared with classHash =", declareResponse.class_hash);
await provider.waitForTransaction(declareResponse.transaction_hash);
console.log("✅ Test Completed.");
