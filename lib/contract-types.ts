import type { BigNumberish, InvokeFunctionResponse, Uint256 } from "starknet";
import type { ContractWithPopulate } from "starknet-dev-toolkit";

export interface PendingUpgrade {
  ready_at: bigint;
  implementation: bigint;
  calldata_hash: bigint;
}

export type GiftFactoryContract = ContractWithPopulate<{
  // IGiftFactory
  get_latest_escrow_class_hash: () => Promise<string>;
  get_escrow_address: (
    escrow_class_hash: BigNumberish,
    sender: BigNumberish,
    gift_token: BigNumberish,
    gift_amount: BigNumberish,
    fee_token: BigNumberish,
    fee_amount: BigNumberish,
    gift_pubkey: BigNumberish,
  ) => Promise<bigint>;
  deposit: (
    escrow_class_hash: BigNumberish,
    gift_token: BigNumberish,
    gift_amount: BigNumberish,
    fee_token: BigNumberish,
    fee_amount: BigNumberish,
    gift_pubkey: BigNumberish,
  ) => Promise<InvokeFunctionResponse>;

  // Ownable
  owner: () => Promise<bigint>;

  // Pausable
  pause: () => Promise<InvokeFunctionResponse>;
  unpause: () => Promise<InvokeFunctionResponse>;

  // ITimelockUpgrade
  propose_upgrade: (new_implementation: BigNumberish, calldata: BigNumberish[]) => Promise<InvokeFunctionResponse>;
  cancel_upgrade: () => Promise<InvokeFunctionResponse>;
  upgrade: (calldata: BigNumberish[]) => Promise<InvokeFunctionResponse>;
  get_pending_upgrade: () => Promise<PendingUpgrade>;

  // ITimelockUpgradeCallback
  perform_upgrade: (new_implementation: BigNumberish, data: BigNumberish[]) => Promise<InvokeFunctionResponse>;
}>;

// Used in upgrade tests for the FutureFactory mock
export type FutureFactoryContract = ContractWithPopulate<{
  get_num: () => Promise<bigint>;
}>;

export type GiftData = {
  factory: string;
  escrow_class_hash: string;
  sender: string;
  gift_token: string;
  gift_amount: Uint256;
  fee_token: string;
  fee_amount: bigint;
  gift_pubkey: bigint;
};

// Used in reentrancy tests
export type ReentrantERC20Contract = ContractWithPopulate<{
  set_gift_data: (
    gift: GiftData,
    receiver: string,
    dust_receiver: string,
    gift_signature: { r: bigint; s: bigint },
  ) => Promise<InvokeFunctionResponse>;
}>;
