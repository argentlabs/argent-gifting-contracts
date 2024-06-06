import { Account, CallData, Contract, RPC, ec, encode, hash, num, uint256 } from "starknet";
import { AccountConstructorArguments, Claim, LegacyStarknetKeyPair, buildClaim, deployer, manager } from "./";

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
  forcedGiftPrivateKey = false,
  giftAmount = GIFT_AMOUNT,
  giftMaxFee = GIFT_MAX_FEE,
): Promise<{
  claimAccount: Account;
  tokenContract: Contract;
  claimSigner: LegacyStarknetKeyPair;
  claim: Claim;
  receiver: string;
}> {
  const tokenContract = await manager.tokens.feeTokenContract(useTxV3);

  // static signer / receiver for gas profiling
  const receiver = forcedGiftPrivateKey ? "0x42" : `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`;
  const claimSigner = new LegacyStarknetKeyPair(forcedGiftPrivateKey ? "0x42" : undefined);
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

  const claim = buildClaim(
    factory,
    claimAccountClassHash,
    giftAmount,
    giftMaxFee,
    tokenContract,
    claimSigner.publicKey,
  );

  const txVersion = useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  const claimAccount = new Account(manager, num.toHex(claimAddress), claimSigner, undefined, txVersion);
  factory.connect(claimAccount);
  return { claimAccount, tokenContract, claimSigner, claim, receiver };
}
