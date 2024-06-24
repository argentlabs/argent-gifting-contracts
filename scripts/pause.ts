import { logTransactionJson } from "./jsonTxBuilder";

/// To use this script, fill in the following value:
/// - factoryAddress: the address of the factory contract

const factoryAddress = "";

if (!factoryAddress) {
  throw new Error("Factory contract address is not set. Please set it in the script file.");
}

const tx = {
  contractAddress: factoryAddress,
  entrypoint: "pause",
  calldata: [],
};

logTransactionJson([tx]);
