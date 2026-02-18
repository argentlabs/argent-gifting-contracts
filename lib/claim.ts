import {
  Account,
  type Call,
  CallData,
  type Calldata,
  ec,
  encode,
  hash,
  num,
  shortString,
  type SuccessfulTransactionReceiptResponseHelper,
  type TransactionReceipt,
  uint256,
  type UniversalDetails,
} from "starknet";

import { deployer, LegacyStarknetKeyPair, manager } from "starknet-dev-toolkit";
import type { GiftData } from "./contract-types.js";

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

async function getClaimExternalData(claimExternal: ClaimExternal) {
  const chainId = await manager.getChainId();
  return {
    types: typesRev1,
    primaryType: "ClaimExternal",
    domain: getDomain(chainId),
    message: { receiver: claimExternal.receiver, "dust receiver": claimExternal.dustReceiver || "0x0" },
  };
}

export class Gift {
  factory: string;
  escrowClassHash: string;
  sender: string;
  giftToken: string;
  giftAmount: bigint;
  feeToken: string;
  feeAmount: bigint;
  giftPubkey: bigint;

  constructor(params: {
    factory: string;
    escrowClassHash: string;
    sender: string;
    giftToken: string;
    giftAmount: bigint;
    feeToken: string;
    feeAmount: bigint;
    giftPubkey: bigint;
  }) {
    this.factory = params.factory;
    this.escrowClassHash = params.escrowClassHash;
    this.sender = params.sender;
    this.giftToken = params.giftToken;
    this.giftAmount = params.giftAmount;
    this.feeToken = params.feeToken;
    this.feeAmount = params.feeAmount;
    this.giftPubkey = params.giftPubkey;
  }

  toCallData(): GiftData {
    return {
      factory: this.factory,
      escrow_class_hash: this.escrowClassHash,
      sender: this.sender,
      gift_token: this.giftToken,
      gift_amount: uint256.bnToUint256(this.giftAmount),
      fee_token: this.feeToken,
      fee_amount: this.feeAmount,
      gift_pubkey: this.giftPubkey,
    };
  }

  escrowAddress(): string {
    return hash.calculateContractAddressFromHash(
      0,
      this.escrowClassHash,
      CallData.compile({
        sender: this.sender,
        gift_token: this.giftToken,
        gift_amount: uint256.bnToUint256(this.giftAmount),
        fee_token: this.feeToken,
        fee_amount: this.feeAmount,
        gift_pubkey: this.giftPubkey,
      }),
      this.factory,
    );
  }
}

export interface StarknetSignature {
  r: bigint;
  s: bigint;
}

export async function signExternalClaim(signParams: {
  gift: Gift;
  receiver: string;
  giftPrivateKey: string;
  dustReceiver?: string;
  forceEscrowAddress?: string;
}): Promise<StarknetSignature> {
  const giftSigner = new LegacyStarknetKeyPair(signParams.giftPrivateKey);
  const claimExternalData = await getClaimExternalData({
    receiver: signParams.receiver,
    dustReceiver: signParams.dustReceiver,
  });
  const signature = await giftSigner.signMessage(
    claimExternalData,
    signParams.forceEscrowAddress || signParams.gift.escrowAddress(),
  );
  const stringArray = signature as string[];
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
}): Promise<TransactionReceipt> {
  const signature = await signExternalClaim({
    gift: args.gift,
    receiver: args.receiver,
    giftPrivateKey: args.giftPrivateKey,
    dustReceiver: args.dustReceiver,
  });

  const claimExternalCallData = CallData.compile([
    args.gift.toCallData(),
    args.receiver,
    args.dustReceiver || "0x0",
    signature,
  ]);
  const response = await deployer.execute(
    executeActionOnAccount(EscrowAction.ClaimExternal, args.gift.escrowAddress(), claimExternalCallData),
  );
  return manager.ensureSuccess(response);
}

export enum EscrowAction {
  ClaimExternal = "claim_external",
  ClaimDust = "claim_dust",
  Cancel = "cancel",
  ClaimInternal = "claim_internal",
}

export function executeActionOnAccount(action: EscrowAction, accountAddress: string, args: Calldata): Call {
  return {
    contractAddress: accountAddress,
    entrypoint: "execute_action",
    calldata: { selector: hash.getSelectorFromName(action), calldata: args },
  };
}

export async function claimInternal(args: {
  gift: Gift;
  receiver: string;
  giftPrivateKey: string;
  overrides?: { escrowAccountAddress?: string; callToAddress?: string };
  details?: UniversalDetails;
}): Promise<TransactionReceipt> {
  const escrowAddress = args.overrides?.escrowAccountAddress || args.gift.escrowAddress();
  const escrowAccount = getEscrowAccount(args.gift, args.giftPrivateKey, escrowAddress);
  // Compile gift separately to control serialization in v9
  const giftCallData = CallData.compile(args.gift.toCallData());
  const response = await escrowAccount.execute(
    [
      {
        contractAddress: args.overrides?.callToAddress ?? escrowAddress,
        calldata: [...giftCallData, args.receiver],
        entrypoint: "claim_internal",
      },
    ],
    { ...args.details },
  );
  return manager.ensureSuccess(response);
}

export async function cancelGift(args: {
  gift: Gift;
  senderAccount?: Account;
}): Promise<TransactionReceipt> {
  const cancelCallData = CallData.compile([args.gift.toCallData()]);
  const account = args.senderAccount || deployer;
  const response = await account.execute(
    executeActionOnAccount(EscrowAction.Cancel, args.gift.escrowAddress(), cancelCallData),
  );
  return manager.ensureSuccess(response);
}

export async function claimDust(args: {
  gift: Gift;
  receiver: string;
  factoryOwner?: Account;
}): Promise<TransactionReceipt> {
  const claimDustCallData = CallData.compile([args.gift.toCallData(), args.receiver]);
  const account = args.factoryOwner || deployer;
  const response = await account.execute(
    executeActionOnAccount(EscrowAction.ClaimDust, args.gift.escrowAddress(), claimDustCallData),
  );
  return manager.ensureSuccess(response);
}

export const randomReceiver = (): string => {
  return `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`;
};

export function getEscrowAccount(gift: Gift, giftPrivateKey: string, forceEscrowAddress?: string): Account {
  return new Account({
    provider: manager,
    address: forceEscrowAddress || num.toHex(gift.escrowAddress()),
    signer: giftPrivateKey,
  });
}
