# Starknet Gifting

The protocol implemented in this repository can be used for gifting tokens to a recipient without giving custody of the tokens to a third party without knowing what the recipient is upfront.

## High level Flow

1. The sender creates a key pair `claim_key` locally.
2. The sender deposits the tokens to be transferred, along with a small amount of fee token (ETH or STK) to cover the fee, to the factory. The sender also specifies `claim_key.pub` as an identifier.
3. The factory creates an escrow account. This account is uniquely identified by several variables such as the sender, the public key, the amount of the gift, etc. given when depositing the gift.
4. The sender shares the private key `claim_key.priv` with the recipient over an external channel such as email or phone.
5. The recipient can claims the tokens by transferring them from the escrow account to an account he controls using `claim_key.priv` to sign the transaction.

## Claiming

Claim can be done in two ways:

### Through the account

Since the escrow contract functions as an account, it can pay for its own transactions, meaning the recipient doesn't need funds to initiate the claim. This is ideal for onboarding new users who can claim a gift to a newly created and even undeployed account. The recipient just needs to call `claim_internal` from the account to the factory. As the account is funded with some extra tokens to cover the fee, these will be used for the claiming operation.  
Once this is done, the account becomes blocked and it is not possible to send any transactions through it.

### Through the factory

It is also possible for someone else to pay for the claim. To do this, the dapp should ask the recipient to provide a valid signature using `claim_key.priv` to acknowledge that they approve only a specific recipient. This can then be submitted to the factory using `claim_external`.

## Canceling Gifts

Gifts can be canceled by the sender provided that they have not been claimed yet. The sender will retrieve both the amount gifted and the fee he agreed paid for that gift.

## Factory Operations

This section outlines all the operations that the factory is allowed to perform.  
As we use OpenZeppelin's Ownable component, this factory has an owner.

### Get Dust

The factory has a function allowing it to claim the dust left on an account. This action can only be done after a claim has been performed. This can also be used to recover in case a user has sent some tokens to the account.

### Pausable

The owner has the capability to pause all deposits. However, it cannot prevent any claims from happening, nor can it prevent any cancellations.

### Upgrade

The factory can be upgraded to a newer version, allowing it to potentially recover from future user mistakes and add more functionalities as needed.  
The upgrade cannot be done immediately and must go through a waiting period of 7 days. There is then a window of 7 days to perform the upgrade.  
It is important to note that through an upgrade, the ownership of the factory and its upgradeability can both be revoked.

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
