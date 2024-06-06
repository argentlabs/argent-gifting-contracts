import chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);
chai.should();

export * from "./accounts";
export * from "./claim";
export * from "./contracts";
export * from "./devnet";
export * from "./expectations";
export * from "./manager";
export * from "./openZeppelinAccount";
export * from "./receipts";
export * from "./signers/legacy";
export * from "./signers/signers";
export * from "./tokens";

export type Constructor<T> = new (...args: any[]) => T;
