import { createDeposit, LegacyStarknetKeyPair } from "../lib";
import { logTransactionJson } from "./json_tx_builder";

/// To use this script, check the following value:

const factoryAddress = "0x42a18d85a621332f749947a96342ba682f08e499b9f1364325903a37c5def60";
const escrowAccountClassHash = "0x661aad3c9812f0dc0a78f320a58bdd8fed18ef601245c20e4bf43667bfd0289";
const ethAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const strkAddress = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

if (!factoryAddress) {
  throw new Error("Factory contract address is not set. Please set it in the script file.");
}

const giftSigner = new LegacyStarknetKeyPair();
const sender = "0x1111111111111111111111111111111111111111111111111111111111111111";
const receiver = "0x2222222222222222222222222222222222222222222222222222222222222222";

const { calls, gift } = createDeposit(sender, {
  giftAmount: 1n, // 1 wei
  feeAmount: 3n * 10n ** 18n, // 3 STRK
  factoryAddress,
  feeTokenAddress: strkAddress,
  giftTokenAddress: ethAddress,
  giftSignerPubKey: giftSigner.publicKey,
  escrowAccountClassHash,
});

console.log();
console.log("const gift =", gift, ";");
console.log(`const receiver = "${receiver}";`);
console.log(`const giftPrivateKey = "${giftSigner.privateKey}";`);
console.log();

console.log("Calls:");
logTransactionJson(calls);
