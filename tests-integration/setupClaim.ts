import { expect } from "chai";
import { Account, CallData, Contract, RPC, Uint256, ec, encode, hash, num, uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, manager } from "../lib";

export const GIFT_SIGNER = new LegacyStarknetKeyPair();
export const CLAIM_PUB_KEY = GIFT_SIGNER.publicKey;
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

export async function setupClaim(
  useTxV3 = false,
  useRandomReceiver = true,
): Promise<{
  factory: Contract;
  claimAccount: Account;
  claim: Claim;
  tokenContract: Contract;
  receiver: string;
}> {
  // static receiver for gas profiling
  const receiver = useRandomReceiver ? `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}` : "0x42";

  // claim account class hash is read from cache
  const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
  const factory = await manager.deployContract("GiftFactory", {
    unique: true,
    constructorCalldata: [claimAccountClassHash, deployer.address],
  });

  // Make a gift
  const tokenContract = await manager.tokens.feeTokenContract(useTxV3);
  tokenContract.connect(deployer);
  factory.connect(deployer);
  await tokenContract.approve(factory.address, GIFT_AMOUNT + GIFT_MAX_FEE);
  await factory.deposit(GIFT_AMOUNT, GIFT_MAX_FEE, tokenContract.address, CLAIM_PUB_KEY);

  // Ensure there is a contract for the claim
  const claimAddress = await factory.get_claim_address(
    deployer.address,
    GIFT_AMOUNT,
    GIFT_MAX_FEE,
    tokenContract.address,
    CLAIM_PUB_KEY,
  );

  const constructorArgs: AccountConstructorArguments = {
    sender: deployer.address,
    amount: uint256.bnToUint256(GIFT_AMOUNT),
    max_fee: GIFT_MAX_FEE,
    token: tokenContract.address,
    claim_pubkey: CLAIM_PUB_KEY,
  };

  const claim: Claim = {
    ...constructorArgs,
    factory: factory.address,
    class_hash: claimAccountClassHash,
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
  const claimAccount = new Account(manager, num.toHex(claimAddress), GIFT_SIGNER, undefined, txVersion);
  factory.connect(claimAccount);
  return { factory, claimAccount, claim, tokenContract, receiver };
}
