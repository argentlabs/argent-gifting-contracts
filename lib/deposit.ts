import { Account, Call, CallData, Contract, InvokeFunctionResponse, TransactionReceipt, hash, uint256 } from "starknet";
import { AccountConstructorArguments, Gift, LegacyStarknetKeyPair, deployer, manager } from "./";

export const STRK_GIFT_MAX_FEE = 200000000000000000n; // 0.2 STRK
export const STRK_GIFT_AMOUNT = STRK_GIFT_MAX_FEE + 1n;
export const ETH_GIFT_MAX_FEE = 200000000000000n; // 0.0002 ETH
export const ETH_GIFT_AMOUNT = ETH_GIFT_MAX_FEE + 1n;

export function getMaxFee(useTxV3: boolean): bigint {
  return useTxV3 ? STRK_GIFT_MAX_FEE : ETH_GIFT_MAX_FEE;
}

export function getGiftAmount(useTxV3: boolean): bigint {
  return useTxV3 ? STRK_GIFT_AMOUNT : ETH_GIFT_AMOUNT;
}

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
  const factory = await manager.loadContract(factoryAddress);
  const feeToken = await manager.loadContract(feeTokenAddress);
  const giftToken = await manager.loadContract(giftTokenAddress);

  const escrowAccountClassHash =
    depositParams.overrides?.escrowAccountClassHash || (await factory.get_latest_escrow_class_hash());
  const gift: Gift = {
    factory: factoryAddress,
    escrow_class_hash: escrowAccountClassHash,
    sender: deployer.address,
    gift_token: giftTokenAddress,
    gift_amount: giftAmount,
    fee_token: feeTokenAddress,
    fee_amount: feeAmount,
    gift_pubkey: giftSignerPubKey,
  };
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
  factory: Contract;
  useTxV3?: boolean;
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
  const useTxV3 = args.useTxV3 || false;
  const giftAmount = args.overrides?.giftAmount ?? getGiftAmount(useTxV3);
  const feeAmount = args.overrides?.feeAmount ?? getMaxFee(useTxV3);

  const feeToken = args.overrides?.feeTokenAddress
    ? await manager.loadContract(args.overrides.feeTokenAddress)
    : await manager.tokens.feeTokenContract(useTxV3);

  const giftTokenAddress = args.overrides?.giftTokenAddress || feeToken.address;
  const giftSigner = new LegacyStarknetKeyPair(args.overrides?.giftPrivateKey);
  const giftPubKey = giftSigner.publicKey;

  const { response, gift } = await deposit({
    sender: deployer,
    overrides: { escrowAccountClassHash },
    giftAmount,
    feeAmount,
    factoryAddress: args.factory.address,
    feeTokenAddress: feeToken.address,
    giftTokenAddress,
    giftSignerPubKey: giftPubKey,
  });
  const txReceipt = await manager.waitForTransaction(response.transaction_hash);
  return { gift, giftPrivateKey: giftSigner.privateKey, txReceipt };
}

export function calculateEscrowAddress(gift: Gift): string {
  const constructorArgs: AccountConstructorArguments = {
    sender: gift.sender,
    gift_token: gift.gift_token,
    gift_amount: gift.gift_amount,
    fee_token: gift.fee_token,
    fee_amount: gift.fee_amount,
    gift_pubkey: gift.gift_pubkey,
  };

  const escrowAddress = hash.calculateContractAddressFromHash(
    0,
    gift.escrow_class_hash,
    CallData.compile({
      ...constructorArgs,
      gift_amount: uint256.bnToUint256(gift.gift_amount),
    }),
    gift.factory,
  );
  return escrowAddress;
}
