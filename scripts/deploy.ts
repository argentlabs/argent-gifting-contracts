import { num } from "starknet";
import { manager, protocolCache, setupGiftProtocol } from "../lib";

const { factory, escrowAccountClassHash, escrowLibraryClassHash } = await setupGiftProtocol();

console.log("GiftFactory classhash:", await manager.getClassHashAt(factory.address));
console.log("GiftFactory address:", factory.address);
console.log("GiftFactory owner:", num.toHex(await factory.owner()));
console.log("EscrowAccount class hash:", escrowAccountClassHash);
console.log("EscrowLibrary class hash:", escrowLibraryClassHash);

// clear from cache just in case
delete protocolCache["GiftFactory"];
delete protocolCache["EscrowLibrary"];
delete protocolCache["EscrowAccount"];
