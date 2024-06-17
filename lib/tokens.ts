import { Contract, num } from "starknet";
import { Manager } from "./manager";

export const ethAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
export const strkAddress = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export class TokenManager {
  private ethCache?: Contract;
  private strkCache?: Contract;

  constructor(private manager: Manager) {}

  async feeTokenContract(useTxV3: boolean): Promise<Contract> {
    return useTxV3 ? this.strkContract() : this.ethContract();
  }

  unitTokenContract(useTxV3: boolean): "FRI" | "WEI" {
    return useTxV3 ? "FRI" : "WEI";
  }

  async ethContract(): Promise<Contract> {
    if (this.ethCache) {
      return this.ethCache;
    }
    const ethProxy = await this.manager.loadContract(ethAddress);
    if (ethProxy.abi.some((entry) => entry.name == "implementation")) {
      const { address } = await ethProxy.implementation();
      const { abi } = await this.manager.loadContract(num.toHex(address));
      this.ethCache = new Contract(abi, ethAddress, ethProxy.providerOrAccount);
    } else {
      this.ethCache = ethProxy;
    }
    return this.ethCache;
  }

  async strkContract(): Promise<Contract> {
    if (this.strkCache) {
      return this.strkCache;
    }
    this.strkCache = await this.manager.loadContract(strkAddress);
    return this.strkCache;
  }

  async tokenBalance(accountAddress: string, tokenAddress: string): Promise<bigint> {
    const token = await this.manager.loadContract(tokenAddress);
    return await token.balance_of(accountAddress);
  }
}
