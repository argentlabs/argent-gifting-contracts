import { expect } from "chai";
import { Account, CallData, Contract, RPC, Uint256, ec, encode, hash, num, uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, manager } from ".";

export const GIFT_AMOUNT = 1000000000000000n;
export const GIFT_MAX_FEE = 50000000000000n;

interface AccountConstructorArguments {
  sender: string;
  amount: Uint256;
  max_fee: bigint;
  token: string;
  claim_pubkey: bigint;
}

interface Claim extends AccountConstructorArguments {
  factory: string;
  class_hash: string;
}

const cache: Record<string, Contract> = {};

export async function setupGiftProtocol(): Promise<{
  factory: Contract;
  claimAccountClassHash: string;
}> {
  const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
  const cachedFactory = cache["GiftFactory"];
  if (cachedFactory) {
    return { factory: cachedFactory, claimAccountClassHash };
  }
  const factory = await manager.deployContract("GiftFactory", {
    unique: true,
    constructorCalldata: [claimAccountClassHash, deployer.address],
  });
  cache["GiftFactory"] = factory;
  return { factory, claimAccountClassHash };
}

export async function setupGift(
  factory: Contract,
  claimAccountClassHash: string,
  useTxV3 = false,
  useRandom = true,
): Promise<{
  claimAccount: Account;
  claim: Claim;
  tokenContract: Contract;
  receiver: string;
  giftSigner: LegacyStarknetKeyPair;
}> {
  // static receiver / signer for gas profiling
  const giftSigner = new LegacyStarknetKeyPair(useRandom ? undefined : "0x42");
  const claimPubKey = giftSigner.publicKey;
  const receiver = useRandom ? `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}` : "0x42";

  // Make a gift
  const tokenContract = await manager.tokens.feeTokenContract(useTxV3);
  tokenContract.connect(deployer);
  factory.connect(deployer);
  await tokenContract.approve(factory.address, GIFT_AMOUNT + GIFT_MAX_FEE);
  await factory.deposit(GIFT_AMOUNT, GIFT_MAX_FEE, tokenContract.address, claimPubKey);

  // Ensure there is a contract for the claim
  const claimAddress = await factory.get_claim_address(
    claimAccountClassHash,
    deployer.address,
    GIFT_AMOUNT,
    GIFT_MAX_FEE,
    tokenContract.address,
    claimPubKey,
  );

  const constructorArgs: AccountConstructorArguments = {
    sender: deployer.address,
    amount: uint256.bnToUint256(GIFT_AMOUNT),
    max_fee: GIFT_MAX_FEE,
    token: tokenContract.address,
    claim_pubkey: claimPubKey,
  };

  const claim: Claim = {
    factory: factory.address,
    class_hash: claimAccountClassHash,
    ...constructorArgs,
  };

  const correctAddress = hash.calculateContractAddressFromHash(
    0,
    claimAccountClassHash,
    CallData.compile({ constructorArgs }),
    factory.address,
  );
  expect(claimAddress).to.be.equal(num.toBigInt(correctAddress));

  // Check balance of the claim contract is correct
  await tokenContract.balance_of(claimAddress).should.eventually.equal(GIFT_AMOUNT + GIFT_MAX_FEE);
  // Check balance receiver address == 0
  await tokenContract.balance_of(receiver).should.eventually.equal(0n);

  const txVersion = useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  const claimAccount = new Account(manager, num.toHex(claimAddress), giftSigner, undefined, txVersion);
  factory.connect(claimAccount);
  return { claimAccount, claim, tokenContract, receiver, giftSigner };
}
