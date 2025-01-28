# Starknet Gifting

The goal of this protocol is to allow sending tokens to a recipient without knowing their address. This is done using a non-custodial escrow contract. Since the escrow contract functions as an account, it can pay for its own transactions, meaning the recipient doesn't need funds to initiate the claim. This is ideal for onboarding new users who can claim a gift to a newly created and even undeployed account.

## High level Flow

1. The sender creates a key pair locally called **gift_key**.
2. The sender deposits the tokens to be transferred, along with a small amount of fee token (ETH or STK) to cover the claim transaction, to the factory. The sender also specifies the **public key** as an identifier.
3. The factory deploys an escrow account to which the gift amount is transferred along with the fee amount.
4. The sender shares the **private key** with the recipient over an external channel such as text or email.
5. The recipient can claim the tokens by transferring them from the escrow account to their account using the private key to sign the transaction.

As the fee should be larger than the claiming transaction cost, there might be a small amount of fee token left. We will refer to this leftover amount as "dust".

## Deposits

Deposits follow the flow described in the first 3 steps above.

![Sessions diagram](/docs/deposit_diagram.png)

For more details please see the `deposit` function at [Deposit example](./lib/deposit.ts).

## Claiming

Claiming can be done in two ways:

### Internal claim

The recipient uses the private key to craft a transaction to claim the gift. The `fee_amount` will be used to cover the transaction fees, so the recipient only gets the `gift_amount`. The recipient doesn’t need to have any funds in their wallet or even a deployed wallet to claim the gift using this method.

![Sessions diagram](/docs/internal_claim.png)

Edge cases:

- Insufficient `fee_amount`: Alternative options are "external claiming", waiting for transaction price to go down, or canceling the gift (see below).
- Dust: `fee_amount` will usually be higher than the actual fee and there will be some amount left in the contract. The protocol owner can collect the dust later.
- If the internal claim transaction fails for any reason, the account won't allow to submit another transaction. But the gift can be cancelled or claimed using the external method.

For more details about how to trigger it please see the `claimInternal` function at [Claim Internal Example](./lib/claim.ts).

### External claim

It is also possible for someone else to pay for the claim fees. This can be useful if the funds deposited to pay for the claim transaction are not enough, or if someone wants to subsidize the claim.

The receiver can use the private key sign a message containing the receiving address (and optionally some address that will receive the dust). Using this signature, anybody can execute a transaction to perform the claim. To do so, they should call `claim_external` on the escrow account (through the `execute_action` entrypoint).

![Sessions diagram](/docs/external_claim.png)

For more details please see the `claimExternal` function at [Claim External Example](./lib/claim.ts).

## Cancelling Gifts

Gifts can be cancelled by the sender provided that they have not been claimed yet. The sender will retrieve both the `gift_amount` and the `fee_amount` they deposited for that gift.

For more details please see the `cancelGift` function at [Cancel example](./lib/claim.ts).

## Operator

This section outlines all the operations that the factory owner is allowed to perform.

### Claim Dust

The operator can claim the dust left in an escrow account. This action can only be done after a claim has been performed.

### Pause deposits

The owner has the capability to pause all deposits. However, it cannot prevent any claims from happening, nor can it prevent any cancellations.

### Upgrade

The protocol can be upgraded to add new functionality or fix issues however, it can only be upgraded after a 7 day timelock. This prevents the owner from upgrading to a malicious implementation, as users will have enough time to leave the protocol by either claiming or cancelling their gifts.

Through an upgrade, the owner can make the protocol non upgradeable in the future.

## Escrow account address calculation

To compute the address of the escrow account, you can either call `get_escrow_address()` with the relevant arguments. Or you can do it off-chain using, for example, starknetJS.  
The parameters are as follow:

- Salt: 0
- Class hash: the class hash of the escrow account
- Constructor calldata: The constructor argument used to deploy the escrow account
- Deployer address: The address of the factory

# Development

## Local development

We recommend you to install scarb through ASDF. Please refer to [these instructions](https://docs.swmansion.com/scarb/download.html#install-via-asdf).  
Thanks to the [.tool-versions file](./.tool-versions), you can install the correct versions for scarb and starknet-foundry by running `asdf install`.

### Test the contracts (Cairo)

```
scarb test
```

### Install the devnet (run in project root folder)

You should have docker installed in your machine then you can start the devnet by running the following command:

```shell
scarb run start-devnet
```

### Install JS dependencies

Install all packages:

```shell
yarn
```

Run all integration tests:

```shell
scarb run test-ts
```
