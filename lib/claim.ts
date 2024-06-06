import { Account, Contract, RPC, Uint256, ec, encode, num, shortString, uint256 } from "starknet";
import { LegacyStarknetKeyPair, deployer, manager } from ".";
import { GIFT_AMOUNT, GIFT_MAX_FEE } from "./deposit";

const typesRev1 = {
  StarknetDomain: [
    { name: "name", type: "shortstring" },
    { name: "version", type: "shortstring" },
    { name: "chainId", type: "shortstring" },
    { name: "revision", type: "shortstring" },
  ],
  ClaimExternal: [{ name: "receiver", type: "ContractAddress" }],
};

function getDomain(chainId: string) {
  // WARNING! revision is encoded as a number in the StarkNetDomain type and not as shortstring
  // This is due to a bug in the Braavos implementation, and has been kept for compatibility
  return {
    name: "GiftAccount.claim_external",
    version: shortString.encodeShortString("1"),
    chainId,
    revision: "1",
  };
}

export interface ClaimExternal {
  receiver: string;
}

export async function getClaimExternalData(claimExternal: ClaimExternal) {
  const chainId = await manager.getChainId();
  return {
    types: typesRev1,
    primaryType: "ClaimExternal",
    domain: getDomain(chainId),
    message: { ...claimExternal },
  };
}

export interface AccountConstructorArguments {
  sender: string;
  amount: Uint256;
  max_fee: bigint;
  token: string;
  claim_pubkey: bigint;
}

export interface Claim extends AccountConstructorArguments {
  factory: string;
  class_hash: string;
}

export function buildClaim(
  factory: Contract,
  claimAccountClassHash: string,
  giftAmount: bigint,
  giftMaxFee: bigint,
  tokenContract: Contract,
  claimSigner: LegacyStarknetKeyPair,
): Claim {
  const constructorArgs: AccountConstructorArguments = {
    sender: deployer.address,
    amount: uint256.bnToUint256(giftAmount),
    max_fee: giftMaxFee,
    token: tokenContract.address,
    claim_pubkey: claimSigner.publicKey,
  };
  return {
    factory: factory.address,
    class_hash: claimAccountClassHash,
    ...constructorArgs,
  };
}

export async function claimExternal(
  factory: Contract,
  receiver: string,
  claim: Claim,
  claimAccountAddress: string,
  giftSigner: LegacyStarknetKeyPair,
  account = deployer,
): Promise<string> {
  const claimExternalData = await getClaimExternalData({ receiver });
  const signature = await giftSigner.signMessage(claimExternalData, claimAccountAddress);

  factory.connect(account);
  const { transaction_hash } = await factory.claim_external(claim, receiver, signature);
  return transaction_hash;
}

export async function claimInternal(
  factory: Contract,
  tokenContract: Contract,
  claimSigner: LegacyStarknetKeyPair,
  forcedGiftPrivateKey = "0x42",
  useTxV3 = false,
  giftAmount = GIFT_AMOUNT,
  giftMaxFee = GIFT_MAX_FEE,
): Promise<{
  claimAccount: Account;
  receiver: string;
}> {
  const receiver = forcedGiftPrivateKey || `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`;
  const claimAccountClassHash = await manager.declareLocalContract("ClaimAccount");
  const claimAddress = await factory.get_claim_address(
    claimAccountClassHash,
    deployer.address,
    giftAmount,
    giftMaxFee,
    tokenContract.address,
    claimSigner.publicKey,
  );
  const claim = buildClaim(factory, claimAccountClassHash, giftAmount, giftMaxFee, tokenContract, claimSigner);
  const txVersion = useTxV3 ? RPC.ETransactionVersion.V3 : RPC.ETransactionVersion.V2;
  const claimAccount = new Account(manager, num.toHex(claimAddress), claimSigner, undefined, txVersion);
  factory.connect(claimAccount);
  await factory.claim_internal(claim, receiver);
  return { claimAccount, receiver };
}
