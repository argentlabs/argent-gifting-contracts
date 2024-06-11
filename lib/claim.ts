import {
  Account,
  CallData,
  RPC,
  TransactionReceipt,
  UniversalDetails,
  ec,
  encode,
  hash,
  shortString,
  uint256,
} from "starknet";
import { LegacyStarknetKeyPair, deployer, ethAddress, manager, strkAddress } from ".";

const typesRev1 = {
  StarknetDomain: [
    { name: "name", type: "shortstring" },
    { name: "version", type: "shortstring" },
    { name: "chainId", type: "shortstring" },
    { name: "revision", type: "shortstring" },
  ],
  ClaimExternal: [{ name: "receiver", type: "ContractAddress" }],
};

function getDomain(chainId: string) {
  // WARNING! revision is encoded as a number in the StarkNetDomain type and not as shortstring
  // This is due to a bug in the Braavos implementation, and has been kept for compatibility
  return {
    name: "GiftAccount.claim_external",
    version: shortString.encodeShortString("1"),
    chainId,
    revision: "1",
  };
}

export interface ClaimExternal {
  receiver: string;
}

export async function getClaimExternalData(claimExternal: ClaimExternal) {
  const chainId = await manager.getChainId();
  return {
    types: typesRev1,
    primaryType: "ClaimExternal",
    domain: getDomain(chainId),
    message: { ...claimExternal },
  };
}

export class Claim {
  constructor(
    public factory: string,
    public class_hash: string, // TODO REMOVE ALL underscores
    public sender: string,
    public gift_token: string,
    public gift_amount: bigint,
    public fee_token: string,
    public fee_amount: bigint,
    public signer = new LegacyStarknetKeyPair(), // TODO This shouldn't be public?
  ) {}

  get claim_pubkey(): bigint {
    return this.signer.publicKey;
  }

  get claimAddress(): string {
    return hash.calculateContractAddressFromHash(
      0,
      this.class_hash,
      CallData.compile({
        sender: this.sender,
        gift_token: this.gift_token,
        gift_amount: uint256.bnToUint256(this.gift_amount),
        fee_token: this.fee_token,
        fee_amount: this.fee_amount,
        claim_pubkey: this.claim_pubkey,
      }),
      this.factory,
    );
  }

  get callDataClaim() {
    return {
      factory: this.factory,
      class_hash: this.class_hash,
      sender: this.sender,
      gift_token: this.gift_token,
      gift_amount: uint256.bnToUint256(this.gift_amount),
      fee_token: this.fee_token,
      fee_amount: this.fee_amount,
      claim_pubkey: this.claim_pubkey,
    };
  }

  public async claimInternal(receiver: string, details?: UniversalDetails): Promise<TransactionReceipt> {
    const txVersion = useTxv3(this.fee_token) ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
    const claimAccount = new Account(manager, this.claimAddress, this.signer, undefined, txVersion);
    return (await claimAccount.execute(
      [
        {
          contractAddress: this.factory,
          calldata: [this.callDataClaim, receiver],
          entrypoint: "claim_internal",
        },
      ],
      undefined,
      { ...details },
    )) as TransactionReceipt;
  }

  public async claimExternal(receiver: string, account = deployer): Promise<TransactionReceipt> {
    const claimExternalData = await getClaimExternalData({ receiver });
    const signature = await this.signer.signMessage(claimExternalData, this.claimAddress);

    return (await account.execute([
      {
        contractAddress: this.factory,
        calldata: [this.callDataClaim, receiver, signature],
        entrypoint: "claim_external",
      },
    ])) as TransactionReceipt;
  }
}

function useTxv3(tokenAddress: string): boolean {
  if (tokenAddress === ethAddress) {
    return false;
  } else if (tokenAddress === strkAddress) {
    return true;
  }
  throw new Error(`Unsupported token`);
}

export const randomReceiver = (): string => {
  return `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`;
};
