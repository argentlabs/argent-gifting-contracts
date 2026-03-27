import type { Account, Call, InvokeFunctionResponse, TransactionReceipt } from "starknet";
import type { Erc20Contract } from "starknet-dev-toolkit";
import { LegacyStarknetKeyPair, deployer, manager } from "starknet-dev-toolkit";
import { Gift } from "./claim.js";
import type { GiftFactoryContract } from "./contract-types.js";

export const STRK_GIFT_MAX_FEE = 200000000000000000n; // 0.2 STRK
export const STRK_GIFT_AMOUNT = STRK_GIFT_MAX_FEE + 1n;

export async function deposit(depositParams: {
  sender: Account;
  giftAmount: bigint;
  feeAmount: bigint;
  factoryAddress: string;
  feeTokenAddress: string;
  giftTokenAddress: string;
  giftSignerPubKey: bigint;
  overrides?: {
    escrowAccountClassHash?: string;
  };
}): Promise<{ response: InvokeFunctionResponse; gift: Gift }> {
  const { sender, giftAmount, feeAmount, factoryAddress, feeTokenAddress, giftTokenAddress, giftSignerPubKey } =
    depositParams;
  const factory: GiftFactoryContract = await manager.loadContract(factoryAddress);
  const feeToken: Erc20Contract = await manager.loadContract(feeTokenAddress);
  const giftToken: Erc20Contract = await manager.loadContract(giftTokenAddress);

  const escrowAccountClassHash =
    depositParams.overrides?.escrowAccountClassHash || (await factory.get_latest_escrow_class_hash());
  const gift = new Gift({
    factory: factoryAddress,
    escrowClassHash: escrowAccountClassHash,
    sender: deployer.address,
    giftToken: giftTokenAddress,
    giftAmount: giftAmount,
    feeToken: feeTokenAddress,
    feeAmount: feeAmount,
    giftPubkey: giftSignerPubKey,
  });
  const calls: Array<Call> = [];
  if (feeTokenAddress === giftTokenAddress) {
    calls.push(feeToken.populateTransaction.approve(factory.address, giftAmount + feeAmount));
  } else {
    calls.push(feeToken.populateTransaction.approve(factory.address, feeAmount));
    calls.push(giftToken.populateTransaction.approve(factory.address, giftAmount));
  }
  calls.push(
    factory.populateTransaction.deposit(
      escrowAccountClassHash,
      giftTokenAddress,
      giftAmount,
      feeTokenAddress,
      feeAmount,
      giftSignerPubKey,
    ),
  );
  return {
    response: await sender.execute(calls),
    gift,
  };
}

export async function defaultDepositTestSetup(args: {
  factory: GiftFactoryContract;
  overrides?: {
    escrowAccountClassHash?: string;
    giftPrivateKey?: bigint;
    giftTokenAddress?: string;
    feeTokenAddress?: string;
    giftAmount?: bigint;
    feeAmount?: bigint;
  };
}): Promise<{
  gift: Gift;
  giftPrivateKey: string;
  txReceipt: TransactionReceipt;
}> {
  const escrowAccountClassHash =
    args.overrides?.escrowAccountClassHash || (await args.factory.get_latest_escrow_class_hash());

  const feeToken = args.overrides?.feeTokenAddress
    ? await manager.loadContract(args.overrides.feeTokenAddress)
    : await manager.tokens.strkContract();

  const giftTokenAddress = args.overrides?.giftTokenAddress || feeToken.address;
  const giftSigner = new LegacyStarknetKeyPair(args.overrides?.giftPrivateKey);
  const giftPubKey = giftSigner.publicKey;

  const { response, gift } = await deposit({
    sender: deployer,
    overrides: { escrowAccountClassHash },
    giftAmount: args.overrides?.giftAmount ?? STRK_GIFT_AMOUNT,
    feeAmount: args.overrides?.feeAmount ?? STRK_GIFT_MAX_FEE,
    factoryAddress: args.factory.address,
    feeTokenAddress: feeToken.address,
    giftTokenAddress,
    giftSignerPubKey: giftPubKey,
  });
  const txReceipt = await manager.ensureSuccess(response);
  return { gift, giftPrivateKey: giftSigner.privateKey, txReceipt };
}
