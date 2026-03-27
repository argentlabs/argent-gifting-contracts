FROM shardlabs/starknet-devnet-rs:0.7.2-seed0

EXPOSE 5050

CMD ["--timeout", "320", "--lite-mode", "--gas-price-fri", "45000000000000", "--data-gas-price-fri", "53000000000", "--l2-gas-price-fri", "8000000000", "--initial-balance", "1000000000000000000000000"]