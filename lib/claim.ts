import {
  Account,
  InvokeFunctionResponse,
  RPC,
  TransactionReceipt,
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

export async function claimExternal(
  claim: Claim,
  receiver: string,
  claimPrivateKey: string,
  account = deployer,
): Promise<TransactionReceipt> {
  const claimAddress = calculateClaimAddress(claim);
  const giftSigner = new LegacyStarknetKeyPair(claimPrivateKey);
  const claimExternalData = await getClaimExternalData({ receiver });
  const signature = await giftSigner.signMessage(claimExternalData, claimAddress);

  return (await account.execute([
    {
      contractAddress: claim.factory,
      calldata: [buildCallDataClaim(claim), receiver, signature],
      entrypoint: "claim_external",
    },
  ])) as TransactionReceipt;
}

export async function claimInternal(
  claim: Claim,
  receiver: string,
  claimPrivateKey: string,
  details?: UniversalDetails,
): Promise<InvokeFunctionResponse> {
  const claimAddress = calculateClaimAddress(claim);

  const txVersion = useTxv3(claim.fee_token) ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  const claimAccount = new Account(manager, num.toHex(claimAddress), claimPrivateKey, undefined, txVersion);
  return await claimAccount.execute(
    [
      {
        contractAddress: claim.factory,
        calldata: [buildCallDataClaim(claim), receiver],
        entrypoint: "claim_internal",
      },
    ],
    undefined,
    { ...details },
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
