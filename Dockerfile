# Use the base image
FROM shardlabs/starknet-devnet-rs:c4185522228f61ba04619151eb5706d4610fb00f

# Expose port 5050
EXPOSE 5050

# Set default command to run the container
CMD ["--gas-price", "36000000000", "--data-gas-price", "1", "--timeout", "320", "--seed", "0"]