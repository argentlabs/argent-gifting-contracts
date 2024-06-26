import {
  Account,
  Call,
  CallData,
  Calldata,
  RPC,
  TransactionReceipt,
  UniversalDetails,
  ec,
  encode,
  hash,
  num,
  shortString,
  uint256,
} from "starknet";

import {
  LegacyStarknetKeyPair,
  StarknetSignature,
  calculateClaimAddress,
  deployer,
  ethAddress,
  manager,
  strkAddress,
} from ".";

const typesRev1 = {
  StarknetDomain: [
    { name: "name", type: "shortstring" },
    { name: "version", type: "shortstring" },
    { name: "chainId", type: "shortstring" },
    { name: "revision", type: "shortstring" },
  ],
  ClaimExternal: [
    { name: "receiver", type: "ContractAddress" },
    { name: "dust receiver", type: "ContractAddress" },
  ],
};

function getDomain(chainId: string) {
  // WARNING! revision is encoded as a number in the StarkNetDomain type and not as shortstring
  // This is due to a bug in the Braavos implementation, and has been kept for compatibility
  return {
    name: "GiftFactory.claim_external",
    version: shortString.encodeShortString("1"),
    chainId,
    revision: "1",
  };
}

export interface ClaimExternal {
  receiver: string;
  dustReceiver?: string;
}

export async function getClaimExternalData(claimExternal: ClaimExternal) {
  const chainId = await manager.getChainId();
  return {
    types: typesRev1,
    primaryType: "ClaimExternal",
    domain: getDomain(chainId),
    message: { receiver: claimExternal.receiver, "dust receiver": claimExternal.dustReceiver || "0x0" },
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
  dustReceiver?: string;
  forceClaimAddress?: string;
}): Promise<StarknetSignature> {
  const giftSigner = new LegacyStarknetKeyPair(signParams.claimPrivateKey);
  const claimExternalData = await getClaimExternalData({
    receiver: signParams.receiver,
    dustReceiver: signParams.dustReceiver,
  });
  const stringArray = (await giftSigner.signMessage(
    claimExternalData,
    signParams.forceClaimAddress || calculateClaimAddress(signParams.claim),
  )) as string[];
  if (stringArray.length !== 2) {
    throw new Error("Invalid signature");
  }
  return { r: BigInt(stringArray[0]), s: BigInt(stringArray[1]) };
}

export async function claimExternal(args: {
  claim: Claim;
  receiver: string;
  claimPrivateKey: string;
  dustReceiver?: string;
  overrides?: { account?: Account };
  details?: UniversalDetails;
}): Promise<TransactionReceipt> {
  const account = args.overrides?.account || deployer;
  const signature = await signExternalClaim({
    claim: args.claim,
    receiver: args.receiver,
    claimPrivateKey: args.claimPrivateKey,
    dustReceiver: args.dustReceiver,
  });

  const claimExternalCallData = CallData.compile([
    buildCallDataClaim(args.claim),
    args.receiver,
    args.dustReceiver || "0x0",
    signature,
  ]);
  const response = await account.execute(
    executeActionOnAccount("claim_external", calculateClaimAddress(args.claim), claimExternalCallData),
    undefined,
    { ...args.details },
  );
  return manager.waitForTransaction(response.transaction_hash);
}

function executeActionOnAccount(functionName: string, accountAddress: string, args: Calldata): Call {
  return {
    contractAddress: accountAddress,
    entrypoint: "execute_action",
    calldata: { selector: hash.getSelectorFromName(functionName), calldata: args },
  };
}

export async function claimInternal(args: {
  claim: Claim;
  receiver: string;
  claimPrivateKey: string;
  overrides?: { EscrowAccountAddress?: string; callToAddress?: string };
  details?: UniversalDetails;
}): Promise<TransactionReceipt> {
  const claimAddress = args.overrides?.EscrowAccountAddress || calculateClaimAddress(args.claim);
  const EscrowAccount = getEscrowAccount(args.claim, args.claimPrivateKey, claimAddress);
  const response = await EscrowAccount.execute(
    [
      {
        contractAddress: args.overrides?.callToAddress ?? claimAddress,
        calldata: [buildCallDataClaim(args.claim), args.receiver],
        entrypoint: "claim_internal",
      },
    ],
    undefined,
    { ...args.details },
  );
  return manager.waitForTransaction(response.transaction_hash);
}

export async function cancelGift(args: { claim: Claim; senderAccount?: Account }): Promise<TransactionReceipt> {
  const cancelCallData = CallData.compile([buildCallDataClaim(args.claim)]);
  const account = args.senderAccount || deployer;
  const response = await account.execute(
    executeActionOnAccount("cancel", calculateClaimAddress(args.claim), cancelCallData),
  );
  return manager.waitForTransaction(response.transaction_hash);
}

export async function getDust(args: {
  claim: Claim;
  receiver: string;
  factoryOwner?: Account;
}): Promise<TransactionReceipt> {
  const getDustCallData = CallData.compile([buildCallDataClaim(args.claim), args.receiver]);
  const account = args.factoryOwner || deployer;
  const response = await account.execute(
    executeActionOnAccount("get_dust", calculateClaimAddress(args.claim), getDustCallData),
  );
  return manager.waitForTransaction(response.transaction_hash);
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

export function getEscrowAccount(claim: Claim, claimPrivateKey: string, forceClaimAddress?: string): Account {
  return new Account(
    manager,
    forceClaimAddress || num.toHex(calculateClaimAddress(claim)),
    claimPrivateKey,
    undefined,
    useTxv3(claim.fee_token) ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2,
  );
}
