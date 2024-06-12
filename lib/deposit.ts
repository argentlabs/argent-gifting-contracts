import { Account, CallData, Contract, InvokeFunctionResponse, ec, encode, hash, uint256 } from "starknet";
import { AccountConstructorArguments, Claim, LegacyStarknetKeyPair, deployer, manager } from "./";

export const GIFT_AMOUNT = 1000000000000000n;
export const GIFT_MAX_FEE = 50000000000000n;

export async function deposit(
  sender: Account,
  giftAmount: bigint,
  feeAmount: bigint,
  factoryAddress: string,
  feeTokenAddress: string,
  giftTokenAddress: string,
  claimSignerPubKey: bigint,
): Promise<InvokeFunctionResponse> {
  const factory = await manager.loadContract(factoryAddress);
  const feeToken = await manager.loadContract(feeTokenAddress);
  const giftToken = await manager.loadContract(giftTokenAddress);
  if (feeTokenAddress === giftTokenAddress) {
    return await sender.execute([
      feeToken.populateTransaction.approve(factory.address, giftAmount + feeAmount),
      factory.populateTransaction.deposit(giftTokenAddress, giftAmount, feeTokenAddress, feeAmount, claimSignerPubKey),
    ]);
  } else {
    return await sender.execute([
      feeToken.populateTransaction.approve(factory.address, feeAmount),
      giftToken.populateTransaction.approve(factory.address, giftAmount),
      factory.populateTransaction.deposit(giftTokenAddress, giftAmount, feeTokenAddress, feeAmount, claimSignerPubKey),
    ]);
  }
}

export async function defaultDepositTestSetup(
  factory: Contract,
  useTxV3 = false,
  giftPrivateKey?: string,
  giftTokenAddress?: string,
  giftAmount = GIFT_AMOUNT,
  giftMaxFee = GIFT_MAX_FEE,
): Promise<{
  claim: Claim;
  claimPrivateKey: string;
}> {
  const tokenContract = await manager.tokens.feeTokenContract(useTxV3);

  // static signer  for gas profiling
  const claimSigner = new LegacyStarknetKeyPair(
    giftPrivateKey || `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`,
  );
  const claimPubKey = claimSigner.publicKey;
  await deposit(
    deployer,
    giftAmount,
    giftMaxFee,
    factory.address,
    tokenContract.address,
    giftTokenAddress || tokenContract.address,
    claimPubKey,
  );

  const claimClassHash = await factory.get_latest_claim_class_hash();

  const claim: Claim = {
    factory: factory.address,
    class_hash: claimClassHash,
    sender: deployer.address,
    gift_token: giftTokenAddress || tokenContract.address,
    gift_amount: giftAmount,
    fee_token: tokenContract.address,
    fee_amount: giftMaxFee,
    claim_pubkey: claimPubKey,
  };

  return { claim, claimPrivateKey: claimSigner.privateKey };
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
