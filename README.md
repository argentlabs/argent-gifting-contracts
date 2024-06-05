// TODO This is outdated

# Starknet Gifting

The protocol implemented in this repository can be used for gifting tokens to a recipient without giving custody of the tokens to a third party. But it can also be used to transfer tokens to a repicient identified by an email or a phone number. Both products are supported by the same smart-contract and depends solely on the client being built on top.

## High level Flow

- The sender creates a key pair `claim_key` locally and deposits the tokens to transfer to the escrow account together with a small amount of fee token (ETH or STRK) to cover the claim. He provides the public key `claim_key.pub` as an identifier for the transfer.
- The sender shares the private key `claim_key.priv` with the recipient over an external channel such as email or phone.
- The recipient claims the tokens by transferring them from the escrow to an account he controls using `claim_key.priv` to sign the transaction.

## Fee

Because the escrow is an account, it can pay for its own transactions and the recipient doesn't need to have funds to initiate the claim. This makes it great to onboard new users that can claim a gift to a newly created and undeployed account.

The Escrow contract can operate in 2 modes depending on the value of the `use_fee` flag.

When `use_fee = false` the sender doesn't need to cover the fee for the claim because the operator of the escrow sponsors the transfers by depositing sufficient ETH or STRK on the escrow contract.

When `use_fee = true` the fee of the claim must be covered by the sender, and he is required to deposit some ETH or STRK together with the token being gifted. The amount of fee token he provides must be sufficient to cover the claim. The recipient of the claim can use up to that value as specified in the max fee of the claim transaction.

If the max fee of the claim transaction is less than the max fee allocated to the claim, the difference is added to a counter and can be later retrieved by the operator of the escrow contract as a paiement for his operation of the protocol. However, the difference between the max fee of the claim transaction and the actual fee of the transaction cannot be acounted for in the contract and will be stuck. We can imagine using that dust later by setting `use_fee = true` and sponsoring gifts for a limited period.

## Canceling Gifts

Gifts can be canceled by the sender provided that they have not been claimed yet. If the gift covers the claim fee the sender can recover both the gift and the claim fee he provided.

In the unlikely event that the recipient tried to claim a gift but the transaction failed in execution, some of the claim fee will have been used. The gift can no longer be claimed but can be canceled by the sender. Canceling the gift will only recover the gift but not the remaining claim fee.

## Development

### asdf

Install asdf following [instructions](https://asdf-vm.com/guide/getting-started.html) and run this

```
asdf plugin add scarb
asdf plugin add starknet-foundry
asdf install
```

### Setup scarb and foundry

Thanks to the [.tool-versions file](./.tool-versions), you don't need to install a specific scarb or starknet foundry version. The correct one will be automatically downloaded and installed.

### Build the contracts

`scarb build`

### Test the contracts

`snforge test`
