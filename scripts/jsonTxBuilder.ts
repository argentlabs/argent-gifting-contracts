import { Call } from "starknet";

export function logTransactionJson(transaction: Call[]) {
  console.log(JSON.stringify(transaction, null, 2));
}
