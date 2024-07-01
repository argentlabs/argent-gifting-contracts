import { CallData } from "starknet";
import { logTransactionJson } from "./json_tx_builder";

/// To use this script, fill in the following value:
/// - factoryAddress: the address of the factory contract
/// - callData: upgrade call data

const factoryAddress = "";

const callData: any[] = [];

if (!factoryAddress) {
  throw new Error("Factory contract address is not set. Please set it in the script file.");
}

const tx = {
  contractAddress: factoryAddress,
  entrypoint: "upgrade",
  calldata: CallData.compile(callData),
};

logTransactionJson([tx]);
