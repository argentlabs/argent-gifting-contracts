import "dotenv/config";
import fs from "fs";
import { Account, RpcProvider, constants, json, type CompiledContract, type CompiledSierraCasm } from "starknet";

// connect provider
const provider = new RpcProvider({ nodeUrl: constants.NetworkName.SN_SEPOLIA });
const account0 = new Account({
  provider,
  address: process.env.ACCOUNT as string,
  signer: process.env.PRIVATE_KEY as string,
});

// Declare Test contract in devnet
const compiledTestSierra = json.parse(
  fs.readFileSync("./target/dev/argent_gifting_EscrowAccount.contract_class.json").toString("ascii"),
) as CompiledContract;
const compiledTestCasm = json.parse(
  fs.readFileSync("./target/dev/argent_gifting_EscrowAccount.compiled_contract_class.json").toString("ascii"),
) as CompiledSierraCasm;
const declareResponse = await account0.declare({
  contract: compiledTestSierra,
  casm: compiledTestCasm,
});
console.log("Test Contract declared with classHash =", declareResponse.class_hash);
await provider.waitForTransaction(declareResponse.transaction_hash);
console.log("✅ Test Completed.");
