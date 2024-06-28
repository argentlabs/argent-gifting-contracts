import { CallData } from "starknet";
import { Gift, buildGiftCallData, executeActionOnAccount } from "../lib/claim";
import { logTransactionJson } from "./jsonTxBuilder";

/// To use this script, fill in the following value:
/// - factoryAddress: the address of the factory contract
/// - escrowAddress: the address of the escrow account
/// - dustReceiver: the address of the dust receiver
/// - claim: the claim object

const factoryAddress = "";
const escrowAddress = "";
const dustReceiver = "";
const claim: Gift = {
  factory: factoryAddress,
  escrow_class_hash: "",
  sender: "",
  gift_token: "",
  gift_amount: 0n,
  fee_token: "",
  fee_amount: 0n,
  gift_pubkey: 0n,
};

if (!factoryAddress) {
  throw new Error("Factory contract address is not set. Please set it in the script file.");
}

if (!dustReceiver) {
  throw new Error("Dust receiver address is not set. Please set it in the script file.");
}

if (!escrowAddress) {
  throw new Error("Escrow address is not set. Please set it in the script file.");
}

for (const key in claim) {
  if (key in claim && !claim[key as keyof typeof claim] && key !== "fee_amount" && key !== "gift_amount") {
    throw new Error(`The property ${key} is empty in the claim object.`);
  }
}

const tx = executeActionOnAccount(
  "get_dust",
  escrowAddress,
  CallData.compile([(buildGiftCallData(claim), dustReceiver)]),
);
logTransactionJson([tx]);
