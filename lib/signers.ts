import { LegacyStarknetKeyPair } from "starknet-dev-toolkit";

export class LongSigner extends LegacyStarknetKeyPair {
  public async signRaw(messageHash: string): Promise<string[]> {
    return ["", ...(await super.signRaw(messageHash))];
  }
}

export class WrongSigner extends LegacyStarknetKeyPair {
  public signRaw(): Promise<string[]> {
    return Promise.resolve(["0x1", "0x1"]);
  }
}
