import { CallData } from "starknet";
import { Claim, buildCallDataClaim } from "../lib/claim";
import { logTransactionJson } from "./jsonTxBuilder";

/// To use this script, fill in the following value:
/// - factoryAddress: the address of the factory contract
/// - dustReceiver: the address of the dust receiver
/// - claim: the claim object

const factoryAddress = "";
const dustReceiver = "";
const claim: Claim = {
  factory: factoryAddress,
  class_hash: "",
  sender: "",
  gift_token: "",
  gift_amount: 0n,
  fee_token: "",
  fee_amount: 0n,
  claim_pubkey: 0n,
};

if (!factoryAddress) {
  throw new Error("Factory contract address is not set. Please set it in the script file.");
}

if (!dustReceiver) {
  throw new Error("Dust receiver address is not set. Please set it in the script file.");
}

for (const key in claim) {
  if (key in claim && !claim[key as keyof typeof claim] && key !== "fee_amount" && key !== "gift_amount") {
    throw new Error(`The property ${key} is empty in the claim object.`);
  }
}

const tx = {
  contractAddress: factoryAddress,
  entrypoint: "get_dust",
  calldata: CallData.compile([buildCallDataClaim(claim), dustReceiver]),
};

logTransactionJson([tx]);
