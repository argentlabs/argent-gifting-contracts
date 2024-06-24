interface Transaction {
  contractAddress: string;
  entrypoint: string;
  calldata: (string | number | undefined)[];
}

export function logTransactionJson(transaction: Transaction[]) {
  console.log(JSON.stringify(transaction, null, 2));
}
