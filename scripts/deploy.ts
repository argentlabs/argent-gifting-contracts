import { num } from "starknet";
import { manager } from "starknet-dev-toolkit";
import { resetProtocolCache, setupGiftProtocol } from "../lib/protocol.js";

const { factory, escrowAccountClassHash, escrowLibraryClassHash } = await setupGiftProtocol();

console.log("GiftFactory classhash:", await manager.getClassHashAt(factory.address));
console.log("GiftFactory address:", factory.address);
console.log("GiftFactory owner:", num.toHex(await factory.owner()));
console.log("EscrowAccount class hash:", escrowAccountClassHash);
console.log("EscrowLibrary class hash:", escrowLibraryClassHash);

// clear from cache just in case
resetProtocolCache();
