import { CallData } from "starknet";
import { logTransactionJson } from "./json_tx_builder";

/// To use this script, fill in the following value:
/// - factoryAddress: the address of the factory contract
/// - newImplementation: the class ahs of the new implementation contract
/// - callData: the call data for the propose_upgrade function

const factoryAddress = "";
const newImplementation = "";
const callData: any[] = [];

if (!factoryAddress) {
  throw new Error("Factory contract address is not set. Please set it in the script file.");
}

if (!newImplementation) {
  throw new Error("New implementation class hash is not set. Please set it in the script file.");
}

const tx = {
  contractAddress: factoryAddress,
  entrypoint: "propose_upgrade",
  calldata: CallData.compile([newImplementation, callData]),
};

// date 7 days from now
const date = new Date();
date.setDate(date.getDate() + 7);

logTransactionJson([tx]);

console.log("Proposed upgrade will be ready at: ", date);
