import { Account, Call, CallData, Contract, InvokeFunctionResponse, TransactionReceipt, hash, uint256 } from "starknet";
import { AccountConstructorArguments, Gift, LegacyStarknetKeyPair, deployer, manager } from ".";

export const STRK_GIFT_MAX_FEE = 200000000000000000n; // 0.2 STRK
export const STRK_GIFT_AMOUNT = STRK_GIFT_MAX_FEE + 1n;
export const ETH_GIFT_MAX_FEE = 200000000000000n; // 0.0002 ETH
export const ETH_GIFT_AMOUNT = ETH_GIFT_MAX_FEE + 1n;

const depositAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      {
        name: "escrow_class_hash",
        type: "core::starknet::class_hash::ClassHash",
      },
      {
        name: "gift_token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "gift_amount",
        type: "core::integer::u256",
      },
      {
        name: "fee_token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "fee_amount",
        type: "core::integer::u128",
      },
      {
        name: "gift_pubkey",
        type: "core::felt252",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
];

const approveAbi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "spender",
        type: "core::starknet::contract_address::ContractAddress",
      },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [{ type: "core::bool" }],
    state_mutability: "external",
  },
];

export function getMaxFee(useTxV3: boolean): bigint {
  return useTxV3 ? STRK_GIFT_MAX_FEE : ETH_GIFT_MAX_FEE;
}

export function getGiftAmount(useTxV3: boolean): bigint {
  return useTxV3 ? STRK_GIFT_AMOUNT : ETH_GIFT_AMOUNT;
}

interface DepositParams {
  giftAmount: bigint;
  feeAmount: bigint;
  factoryAddress: string;
  feeTokenAddress: string;
  giftTokenAddress: string;
  giftSignerPubKey: bigint;
  escrowAccountClassHash: string;
}

export function createDeposit(
  sender: string,
  {
    giftAmount,
    feeAmount,
    factoryAddress,
    feeTokenAddress,
    giftTokenAddress,
    giftSignerPubKey,
    escrowAccountClassHash,
  }: DepositParams,
) {
  const factory = new Contract(depositAbi, factoryAddress);
  const feeToken = new Contract(approveAbi, feeTokenAddress);
  const giftToken = new Contract(approveAbi, giftTokenAddress);
  const calls: Call[] = [];
  if (feeTokenAddress === giftTokenAddress) {
    calls.push(feeToken.populateTransaction.approve(factoryAddress, giftAmount + feeAmount));
  } else {
    calls.push(feeToken.populateTransaction.approve(factoryAddress, feeAmount));
    calls.push(giftToken.populateTransaction.approve(factoryAddress, giftAmount));
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
  const gift: Gift = {
    factory: factoryAddress,
    escrow_class_hash: escrowAccountClassHash,
    sender,
    gift_token: giftTokenAddress,
    gift_amount: giftAmount,
    fee_token: feeTokenAddress,
    fee_amount: feeAmount,
    gift_pubkey: giftSignerPubKey,
  };
  return { calls, gift };
}

export async function deposit(
  sender: Account,
  depositParams: DepositParams,
): Promise<{ response: InvokeFunctionResponse; gift: Gift }> {
  const { calls, gift } = createDeposit(sender.address, depositParams);
  const response = await sender.execute(calls);
  return { response, gift };
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

  const { response, gift } = await deposit(deployer, {
    giftAmount,
    feeAmount,
    factoryAddress: args.factory.address,
    feeTokenAddress: feeToken.address,
    giftTokenAddress,
    giftSignerPubKey: giftPubKey,
    escrowAccountClassHash,
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

  const calldata = CallData.compile({ ...constructorArgs, gift_amount: uint256.bnToUint256(gift.gift_amount) });
  const escrowAddress = hash.calculateContractAddressFromHash(0, gift.escrow_class_hash, calldata, gift.factory);
  return escrowAddress;
}
