# Starknet Gifting

The goal of this protocol is to allow sending tokens to a recipient without knowing their address. This is done using a non-custodial escrow contract. Since the escrow contract functions as an account, it can pay for its own transactions, meaning the recipient doesn't need funds to initiate the claim. This is ideal for onboarding new users who can claim a gift to a newly created and even undeployed account.

## High level Flow

1. The sender creates a key pair locally called **gift_key**.
2. The sender deposits the tokens to be transferred, along with a small amount of fee token (ETH or STK) to cover the claim transaction, to the factory. The sender also specifies the **public key** as an identifier.
3. The factory deploys an escrow account to which the gift amount is transferred along with the fee amount.
4. The sender shares the **private key** with the recipient over an external channel such as text or email.
5. The recipient can claim the tokens by transferring them from the escrow account to their account using the private key to sign the transaction.

As the fee should be larger than the claiming transaction cost, there might be a small amount of fee token left. We will refer to this leftover amount as "dust".

## Claiming

Claiming can be done in two ways:

### Through the account

The recipient just needs to call `claim_internal` from the account to the factory. As the account is funded with some extra tokens (ETH or STRK) which will be used for the claiming operation.  
If this transaction fails for any reason, the account won't allow to submit another transaction. But the gift can still be claimed using the external method.

### Through the factory

It is also possible for someone else to pay for the claim. To do this, the dapp should ask the recipient to provide a valid signature using the private key. The SNIP-12 compliant message the user must sign is as follows: `ClaimExternal { receiver }`. This ensures that the user acknowledges and approves only a specific recipient. This signature should then be used as an argument when calling `claim_external` on the factory.

## Cancelling Gifts

Gifts can be canceled by the sender provided that they have not been claimed yet. The sender will retrieve both the `gift_amount` and the `fee_amount` he agreed to pay for that gift.  
If the gift has already been claimed, this allows the sender to redeem the leftover dust remaining.

## Factory Operations

This section outlines all the operations that the factory is allowed to perform.  
As we use OpenZeppelin's Ownable component, this factory has an owner.

### Claim Dust

The factory has a function allowing it to claim the dust left on an account. This action can only be done after a claim has been performed. This can also be used to recover any excess tokens a user may have sent to the account.

### Pausable

The owner has the capability to pause all deposits. However, it cannot prevent any claims from happening, nor can it prevent any cancellations.

### Upgrade

The factory can be upgraded to a newer version, allowing it to potentially recover from future user mistakes and add more functionalities as needed.  
The upgrade cannot be done immediately and must go through a waiting period of 7 days. There is then a window of 7 days to perform the upgrade.  
It is important to note that through an upgrade, the ownership of the factory and its upgradeability can both be revoked.

## Gift account address calculation

To compute the address of the escrow account, you can either call `get_escrow_address()` with the relevant arguments. Or you can do it off-chain using, for example, starknetJS.  
The parameters are as follow:

- Salt: 0
- Class hash: the class hash of the escrow account
- Constructor calldata: The constructor argument used to deploy the escrow account
- Deployer address: The address of the factory

# Development

## Local development

We recommend you to install scarb through ASDF. Please refer to [these instructions](https://docs.swmansion.com/scarb/download.html#install-via-asdf).  
Thanks to the [.tool-versions file](./.tool-versions), you don't need to install a specific scarb or starknet foundry version. The correct one will be automatically downloaded and installed.

##@ Test the contracts (Cairo)

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
