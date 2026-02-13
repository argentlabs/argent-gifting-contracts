import { LegacyStarknetKeyPair } from "starknet-dev-toolkit";

export class LongSigner extends LegacyStarknetKeyPair {
  public async signRaw(messageHash: string): Promise<string[]> {
    return ["", ...(await super.signRaw(messageHash))];
  }
}

export class WrongSigner extends LegacyStarknetKeyPair {
  public async signRaw(_messageHash: string): Promise<string[]> {
    return ["0x1", "0x1"];
  }
}
