import { Account, Call, CallData, Contract, InvokeFunctionResponse, TransactionReceipt, hash, uint256 } from "starknet";
import { AccountConstructorArguments, Claim, LegacyStarknetKeyPair, deployer, manager } from "./";

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
  claimSignerPubKey: bigint;
  overrides?: {
    EscrowAccountClassHash?: string;
  };
}): Promise<{ response: InvokeFunctionResponse; claim: Claim }> {
  const { sender, giftAmount, feeAmount, factoryAddress, feeTokenAddress, giftTokenAddress, claimSignerPubKey } =
    depositParams;
  const factory = await manager.loadContract(factoryAddress);
  const feeToken = await manager.loadContract(feeTokenAddress);
  const giftToken = await manager.loadContract(giftTokenAddress);

  const EscrowAccountClassHash =
    depositParams.overrides?.EscrowAccountClassHash || (await factory.get_latest_claim_class_hash());
  const claim: Claim = {
    factory: factoryAddress,
    class_hash: EscrowAccountClassHash,
    sender: deployer.address,
    gift_token: giftTokenAddress,
    gift_amount: giftAmount,
    fee_token: feeTokenAddress,
    fee_amount: feeAmount,
    claim_pubkey: claimSignerPubKey,
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
      EscrowAccountClassHash,
      giftTokenAddress,
      giftAmount,
      feeTokenAddress,
      feeAmount,
      claimSignerPubKey,
    ),
  );
  return {
    response: await sender.execute(calls),
    claim,
  };
}

export async function defaultDepositTestSetup(args: {
  factory: Contract;
  useTxV3?: boolean;
  overrides?: {
    EscrowAccountClassHash?: string;
    claimPrivateKey?: bigint;
    giftTokenAddress?: string;
    feeTokenAddress?: string;
    giftAmount?: bigint;
    feeAmount?: bigint;
  };
}): Promise<{
  claim: Claim;
  claimPrivateKey: string;
  txReceipt: TransactionReceipt;
}> {
  const EscrowAccountClassHash =
    args.overrides?.EscrowAccountClassHash || (await args.factory.get_latest_claim_class_hash());
  const useTxV3 = args.useTxV3 || false;
  const giftAmount = args.overrides?.giftAmount ?? getGiftAmount(useTxV3);
  const feeAmount = args.overrides?.feeAmount ?? getMaxFee(useTxV3);

  const feeToken = args.overrides?.feeTokenAddress
    ? await manager.loadContract(args.overrides.feeTokenAddress)
    : await manager.tokens.feeTokenContract(useTxV3);

  const giftTokenAddress = args.overrides?.giftTokenAddress || feeToken.address;
  const claimSigner = new LegacyStarknetKeyPair(args.overrides?.claimPrivateKey);
  const claimPubKey = claimSigner.publicKey;

  const { response, claim } = await deposit({
    sender: deployer,
    overrides: { EscrowAccountClassHash },
    giftAmount,
    feeAmount,
    factoryAddress: args.factory.address,
    feeTokenAddress: feeToken.address,
    giftTokenAddress,
    claimSignerPubKey: claimPubKey,
  });
  const txReceipt = await manager.waitForTransaction(response.transaction_hash);
  return { claim, claimPrivateKey: claimSigner.privateKey, txReceipt };
}

export function calculateClaimAddress(claim: Claim): string {
  const constructorArgs: AccountConstructorArguments = {
    sender: claim.sender,
    gift_token: claim.gift_token,
    gift_amount: claim.gift_amount,
    fee_token: claim.fee_token,
    fee_amount: claim.fee_amount,
    claim_pubkey: claim.claim_pubkey,
  };

  const claimAddress = hash.calculateContractAddressFromHash(
    0,
    claim.class_hash,
    CallData.compile({
      ...constructorArgs,
      gift_amount: uint256.bnToUint256(claim.gift_amount),
    }),
    claim.factory,
  );
  return claimAddress;
}
