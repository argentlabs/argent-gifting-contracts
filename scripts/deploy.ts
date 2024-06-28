import { protocolCache, setupGiftProtocol } from "../lib";

const { factory, escrowAccountClassHash, escrowLibraryClassHash } = await setupGiftProtocol();

console.log("GiftFactory address:", factory.address);
console.log("EscrowAccount class hash:", escrowAccountClassHash);
console.log("EscrowLibrary class hash:", escrowLibraryClassHash);

// clear from cache just in case
delete protocolCache["GiftFactory"];
delete protocolCache["EscrowLibrary"];
delete protocolCache["EscrowAccount"];
