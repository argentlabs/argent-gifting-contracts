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
  calculateEscrowAddress,
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
  gift_pubkey: bigint;
}

export interface Gift extends AccountConstructorArguments {
  factory: string;
  class_hash: string;
}

export function buildGiftCallData(gift: Gift) {
  return {
    ...gift,
    gift_amount: uint256.bnToUint256(gift.gift_amount),
  };
}

export async function signExternalClaim(signParams: {
  gift: Gift;
  receiver: string;
  giftPrivateKey: string;
  dustReceiver?: string;
  forceClaimAddress?: string;
}): Promise<StarknetSignature> {
  const giftSigner = new LegacyStarknetKeyPair(signParams.giftPrivateKey);
  const claimExternalData = await getClaimExternalData({
    receiver: signParams.receiver,
    dustReceiver: signParams.dustReceiver,
  });
  const stringArray = (await giftSigner.signMessage(
    claimExternalData,
    signParams.forceClaimAddress || calculateEscrowAddress(signParams.gift),
  )) as string[];
  if (stringArray.length !== 2) {
    throw new Error("Invalid signature");
  }
  return { r: BigInt(stringArray[0]), s: BigInt(stringArray[1]) };
}

export async function claimExternal(args: {
  gift: Gift;
  receiver: string;
  giftPrivateKey: string;
  dustReceiver?: string;
  overrides?: { account?: Account };
  details?: UniversalDetails;
}): Promise<TransactionReceipt> {
  const account = args.overrides?.account || deployer;
  const signature = await signExternalClaim({
    gift: args.gift,
    receiver: args.receiver,
    giftPrivateKey: args.giftPrivateKey,
    dustReceiver: args.dustReceiver,
  });

  const claimExternalCallData = CallData.compile([
    buildGiftCallData(args.gift),
    args.receiver,
    args.dustReceiver || "0x0",
    signature,
  ]);
  const response = await account.execute(
    executeActionOnAccount("claim_external", calculateEscrowAddress(args.gift), claimExternalCallData),
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
  gift: Gift;
  receiver: string;
  giftPrivateKey: string;
  overrides?: { EscrowAccountAddress?: string; callToAddress?: string };
  details?: UniversalDetails;
}): Promise<TransactionReceipt> {
  const escrowAddress = args.overrides?.EscrowAccountAddress || calculateEscrowAddress(args.gift);
  const escrowAccount = getEscrowAccount(args.gift, args.giftPrivateKey, escrowAddress);
  const response = await escrowAccount.execute(
    [
      {
        contractAddress: args.overrides?.callToAddress ?? escrowAddress,
        calldata: [buildGiftCallData(args.gift), args.receiver],
        entrypoint: "claim_internal",
      },
    ],
    undefined,
    { ...args.details },
  );
  return manager.waitForTransaction(response.transaction_hash);
}

export async function cancelGift(args: { gift: Gift; senderAccount?: Account }): Promise<TransactionReceipt> {
  const cancelCallData = CallData.compile([buildGiftCallData(args.gift)]);
  const account = args.senderAccount || deployer;
  const response = await account.execute(
    executeActionOnAccount("cancel", calculateEscrowAddress(args.gift), cancelCallData),
  );
  return manager.waitForTransaction(response.transaction_hash);
}

export async function claimDust(args: {
  gift: Gift;
  receiver: string;
  factoryOwner?: Account;
}): Promise<TransactionReceipt> {
  const claimDustCallData = CallData.compile([buildGiftCallData(args.gift), args.receiver]);
  const account = args.factoryOwner || deployer;
  const response = await account.execute(
    executeActionOnAccount("claim_dust", calculateEscrowAddress(args.gift), claimDustCallData),
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

export function getEscrowAccount(gift: Gift, giftPrivateKey: string, forceClaimAddress?: string): Account {
  return new Account(
    manager,
    forceClaimAddress || num.toHex(calculateEscrowAddress(gift)),
    giftPrivateKey,
    undefined,
    useTxv3(gift.fee_token) ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2,
  );
}
