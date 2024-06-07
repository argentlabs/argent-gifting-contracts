import { CallData, Contract, hash, uint256 } from "starknet";
import { AccountConstructorArguments, LegacyStarknetKeyPair, deployer, manager } from "./";

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
  claimAddress: string;
  tokenContract: Contract;
  claimSigner: LegacyStarknetKeyPair;
}> {
  const tokenContract = await manager.tokens.feeTokenContract(useTxV3);

  // static signer  for gas profiling
  const claimSigner = new LegacyStarknetKeyPair(giftPrivateKey || "0x42");
  const claimPubKey = claimSigner.publicKey;
  await deposit(factory, tokenContract, claimPubKey);

  const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");

  const constructorArgs: AccountConstructorArguments = {
    sender: deployer.address,
    amount: uint256.bnToUint256(giftAmount),
    max_fee: giftMaxFee,
    token: tokenContract.address,
    claim_pubkey: claimSigner.publicKey,
  };

  const claimAddress = hash.calculateContractAddressFromHash(
    0,
    claimAccountClassHash,
    CallData.compile({ constructorArgs }),
    factory.address,
  );

  return { claimAddress, tokenContract, claimSigner };
}
