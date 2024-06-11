import { Account, Contract } from "starknet";
import { Claim, LegacyStarknetKeyPair, deployer, manager } from "./";

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
) {
  const factory = await manager.loadContract(factoryAddress);
  const feeToken = await manager.loadContract(feeTokenAddress);
  const giftToken = await manager.loadContract(giftTokenAddress);
  if (feeTokenAddress === giftTokenAddress) {
    await sender.execute([
      feeToken.populateTransaction.approve(factory.address, giftAmount + feeAmount),
      factory.populateTransaction.deposit(giftTokenAddress, giftAmount, feeTokenAddress, feeAmount, claimSignerPubKey),
    ]);
  } else {
    await sender.execute([
      feeToken.populateTransaction.approve(factory.address, feeAmount),
      giftToken.populateTransaction.approve(factory.address, giftAmount),
      factory.populateTransaction.deposit(giftTokenAddress, giftAmount, feeTokenAddress, feeAmount, claimSignerPubKey),
    ]);
  }
}

export async function defaultDepositTestSetup(
  factory: Contract,
  useTxV3 = false,
  signer = new LegacyStarknetKeyPair(),
  giftTokenAddress?: string,
  giftAmount = GIFT_AMOUNT,
  giftMaxFee = GIFT_MAX_FEE,
): Promise<Claim> {
  const tokenContract = await manager.tokens.feeTokenContract(useTxV3);

  const claimClassHash = await factory.get_latest_claim_class_hash();
  const claim = new Claim(
    factory.address,
    claimClassHash,
    deployer.address,
    giftTokenAddress || tokenContract.address,
    giftAmount,
    tokenContract.address,
    giftMaxFee,
    signer,
  );

  await deposit(
    deployer,
    giftAmount,
    giftMaxFee,
    factory.address,
    tokenContract.address,
    giftTokenAddress || tokenContract.address,
    claim.claim_pubkey,
  );

  return claim;
}
