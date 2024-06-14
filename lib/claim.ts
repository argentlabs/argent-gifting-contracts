import {
  Account,
  InvokeFunctionResponse,
  RPC,
  Signature,
  UniversalDetails,
  ec,
  encode,
  num,
  shortString,
  uint256,
} from "starknet";
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

export interface AccountConstructorArguments {
  sender: string;
  gift_token: string;
  gift_amount: bigint;
  fee_token: string;
  fee_amount: bigint;
  claim_pubkey: bigint;
}

export interface Claim extends AccountConstructorArguments {
  factory: string;
  class_hash: string;
}

export function buildCallDataClaim(claim: Claim) {
  return {
    ...claim,
    gift_amount: uint256.bnToUint256(claim.gift_amount),
  };
}

export async function signExternalClaim(signParams: {
  claim: Claim;
  receiver: string;
  claimPrivateKey: string;
  forceClaimAddress?: string;
}): Promise<Signature> {
  const giftSigner = new LegacyStarknetKeyPair(signParams.claimPrivateKey);
  const claimExternalData = await getClaimExternalData({ receiver: signParams.receiver });
  return await giftSigner.signMessage(
    claimExternalData,
    signParams.forceClaimAddress || calculateClaimAddress(signParams.claim),
  );
}

export async function claimExternal(args: {
  claim: Claim;
  receiver: string;
  claimPrivateKey: string;
  overrides?: { claimAccountAddress?: string; factoryAddress?: string; signature?: Signature; account?: Account };
  details?: UniversalDetails;
}): Promise<InvokeFunctionResponse> {
  const account = args.overrides?.account || deployer;
  const signature =
    args.overrides?.signature ||
    (await signExternalClaim({
      claim: args.claim,
      receiver: args.receiver,
      claimPrivateKey: args.claimPrivateKey,
      forceClaimAddress: args.overrides?.claimAccountAddress,
    }));
  return await account.execute(
    [
      {
        contractAddress: args.overrides?.factoryAddress || args.claim.factory,
        calldata: [buildCallDataClaim(args.claim), args.receiver, signature],
        entrypoint: "claim_external",
      },
    ],
    undefined,
    { ...args.details },
  );
}

export async function claimInternal(args: {
  claim: Claim;
  receiver: string;
  claimPrivateKey: string;
  overrides?: { claimAccountAddress?: string; factoryAddress?: string };
  details?: UniversalDetails;
}): Promise<InvokeFunctionResponse> {
  const claimAddress = args.overrides?.claimAccountAddress || calculateClaimAddress(args.claim);
  const claimAccount = getClaimAccount(args.claim, args.claimPrivateKey, claimAddress);
  return await claimAccount.execute(
    [
      {
        contractAddress: args.overrides?.factoryAddress || args.claim.factory,
        calldata: [buildCallDataClaim(args.claim), args.receiver],
        entrypoint: "claim_internal",
      },
    ],
    undefined,
    { ...args.details },
  );
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

export function getClaimAccount(claim: Claim, claimPrivateKey: string, forceClaimAddress?: string): Account {
  return new Account(
    manager,
    forceClaimAddress || num.toHex(calculateClaimAddress(claim)),
    claimPrivateKey,
    undefined,
    useTxv3(claim.fee_token) ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2,
  );
}
