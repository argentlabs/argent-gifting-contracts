import { Account, Call, CallData, Contract, InvokeFunctionResponse, hash, uint256 } from "starknet";
import { AccountConstructorArguments, Claim, LegacyStarknetKeyPair, deployer, manager } from "./";

export const GIFT_AMOUNT = 1000000000000000n;
export const GIFT_MAX_FEE = 50000000000000n;

export async function deposit(depositParams: {
  sender: Account;
  giftAmount: bigint;
  feeAmount: bigint;
  factoryAddress: string;
  feeTokenAddress: string;
  giftTokenAddress: string;
  claimSignerPubKey: bigint;
}): Promise<{ response: InvokeFunctionResponse; claim: Claim }> {
  const { sender, giftAmount, feeAmount, factoryAddress, feeTokenAddress, giftTokenAddress, claimSignerPubKey } =
    depositParams;
  const factory = await manager.loadContract(factoryAddress);
  const feeToken = await manager.loadContract(feeTokenAddress);
  const giftToken = await manager.loadContract(giftTokenAddress);

  const classHash = await factory.get_latest_claim_class_hash();
  const claim: Claim = {
    factory: factoryAddress,
    class_hash: classHash,
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
    factory.populateTransaction.deposit(giftTokenAddress, giftAmount, feeTokenAddress, feeAmount, claimSignerPubKey),
  );
  return {
    response: await sender.execute(calls),
    claim,
  };
}

export async function defaultDepositTestSetup(
  factory: Contract,
  useTxV3 = false,
  giftPrivateKey?: bigint,
  giftTokenAddress?: string,
  giftAmount = GIFT_AMOUNT,
  giftMaxFee = GIFT_MAX_FEE,
): Promise<{
  claim: Claim;
  claimPrivateKey: string;
  response: InvokeFunctionResponse;
}> {
  const tokenContract = await manager.tokens.feeTokenContract(useTxV3);
  const claimSigner = new LegacyStarknetKeyPair(giftPrivateKey);
  const claimPubKey = claimSigner.publicKey;

  const { response, claim } = await deposit({
    sender: deployer,
    giftAmount,
    feeAmount: giftMaxFee,
    factoryAddress: factory.address,
    feeTokenAddress: tokenContract.address,
    giftTokenAddress: giftTokenAddress || tokenContract.address,
    claimSignerPubKey: claimPubKey,
  });

  return { claim, claimPrivateKey: claimSigner.privateKey, response };
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
