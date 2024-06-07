import { CallData, Contract, ec, encode, hash, uint256 } from "starknet";
import { AccountConstructorArguments, Claim, LegacyStarknetKeyPair, deployer, manager } from "./";

export const GIFT_AMOUNT = 1000000000000000n;
export const GIFT_MAX_FEE = 50000000000000n;

export async function deposit(
  factory: Contract,
  tokenContract: Contract,
  claimSignerPubKey: bigint,
  sender = deployer,
  amount = GIFT_AMOUNT,
  feeAmount = GIFT_MAX_FEE,
) {
  // Make a gift
  tokenContract.connect(sender);
  factory.connect(sender);
  await sender.execute([
    tokenContract.populateTransaction.approve(factory.address, amount + feeAmount),
    factory.populateTransaction.deposit(amount, feeAmount, tokenContract.address, claimSignerPubKey),
  ]);
}

export async function defaultDepositTestSetup(
  factory: Contract,
  useTxV3 = false,
  giftPrivateKey?: string,
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
  await deposit(factory, tokenContract, claimPubKey);

  const claimClassHash = await factory.get_latest_claim_class_hash();

  const claim: Claim = {
    factory: factory.address,
    class_hash: claimClassHash,
    sender: deployer.address,
    amount: giftAmount,
    max_fee: giftMaxFee,
    token: tokenContract.address,
    claim_pubkey: claimPubKey,
  };
  return { claim, claimPrivateKey: claimSigner.privateKey };
}

export function calculateClaimAddress(claim: Claim): string {
  const constructorArgs: AccountConstructorArguments = {
    sender: claim.sender,
    amount: claim.amount,
    max_fee: claim.max_fee,
    token: claim.token,
    claim_pubkey: claim.claim_pubkey,
  };

  const claimAddress = hash.calculateContractAddressFromHash(
    0,
    claim.class_hash,
    CallData.compile({ ...constructorArgs, amount: uint256.bnToUint256(claim.amount) }),
    claim.factory,
  );
  return claimAddress;
}
