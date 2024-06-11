import { Account, RPC, TransactionReceipt, UniversalDetails, ec, encode, num, shortString, uint256 } from "starknet";
import { LegacyStarknetKeyPair, calculateClaimAddress, deployer, ethAddress, manager, strkAddress } from ".";

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
    public class_hash: string,
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
    return calculateClaimAddress(this);
  }

  get callDataClaim() {
    return {
      ...this,
      gift_amount: uint256.bnToUint256(this.gift_amount),
    };
  }

  public async claimInternal(receiver: string, details?: UniversalDetails): Promise<TransactionReceipt> {
    const claimAddress = this.claimAddress;

    const txVersion = useTxv3(this.fee_token) ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
    const claimAccount = new Account(manager, num.toHex(claimAddress), this.signer, undefined, txVersion);
    console.log("this");
    console.log(this);
    console.log(this.claimAddress)
    console.log("claimAccount");
    console.log(claimAccount);
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
}

export function buildCallDataClaim(claim: Claim) {
  return {
    ...claim,
    gift_amount: uint256.bnToUint256(claim.gift_amount),
  };
}

// Move this onto the claim class
export async function claimExternal(claim: Claim, receiver: string, account = deployer): Promise<TransactionReceipt> {
  const claimAddress = calculateClaimAddress(claim);
  const claimExternalData = await getClaimExternalData({ receiver });
  const signature = await claim.signer.signMessage(claimExternalData, claimAddress);

  return (await account.execute([
    {
      contractAddress: claim.factory,
      calldata: [buildCallDataClaim(claim), receiver, signature],
      entrypoint: "claim_external",
    },
  ])) as TransactionReceipt;
}

// Move this onto the claim class
export async function claimInternal(
  claim: Claim,
  receiver: string,
  details?: UniversalDetails,
): Promise<TransactionReceipt> {
  const claimAddress = calculateClaimAddress(claim);

  const txVersion = useTxv3(claim.fee_token) ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  const claimAccount = new Account(manager, num.toHex(claimAddress), claim.signer, undefined, txVersion);
  console.log(claim);
  return (await claimAccount.execute(
    [
      {
        contractAddress: claim.factory,
        calldata: [buildCallDataClaim(claim), receiver],
        entrypoint: "claim_internal",
      },
    ],
    undefined,
    { ...details },
  )) as TransactionReceipt;
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
