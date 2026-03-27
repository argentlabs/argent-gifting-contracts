import { CallData } from "starknet";
import { EscrowAction, Gift, executeActionOnAccount } from "../lib/claim.js";
import { logTransactionJson } from "./json_tx_builder.js";

/// To use this script, fill in the following value:
/// - factoryAddress: the address of the factory contract
/// - dustReceiver: the address of the dust receiver
/// - claim: the claim object

const factoryAddress = "";
const dustReceiver = "";
const claim = new Gift({
  factory: factoryAddress,
  escrowClassHash: "",
  sender: "",
  giftToken: "",
  giftAmount: 0n,
  feeToken: "",
  feeAmount: 0n,
  giftPubkey: 0n,
});

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

const tx = executeActionOnAccount(
  EscrowAction.ClaimDust,
  claim.escrowAddress(),
  CallData.compile([claim.toCallData(), dustReceiver]),
);
logTransactionJson([tx]);
