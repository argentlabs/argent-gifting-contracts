import { RawArgs, RpcProvider } from "starknet";
import { Constructor } from ".";

export const dumpFolderPath = "./dump";
export const devnetBaseUrl = "http://127.0.0.1:5050";

export const WithDevnet = <T extends Constructor<RpcProvider>>(Base: T) =>
  class extends Base {
    get isDevnet() {
      return this.channel.nodeUrl.startsWith(devnetBaseUrl);
    }

    // Polls quickly for a local network
    waitForTransaction(transactionHash: string, options = {}) {
      const retryInterval = this.isDevnet ? 250 : 1000;
      return super.waitForTransaction(transactionHash, { retryInterval, ...options });
    }

    // unit should be "WEI" | "FRI" but as a shortcut we allow any string ATM (To be fixed)
    async mint(address: string, amount: number | bigint, unit: string) {
      await this.handlePost("mint", { address, amount: Number(amount), unit });
    }

    async increaseTime(timeInSeconds: number | bigint) {
      await this.handlePost("increase_time", { time: Number(timeInSeconds) });
    }

    async setTime(timeInSeconds: number | bigint) {
      await this.handlePost("set_time", { time: Number(timeInSeconds), generate_block: true });
    }

    async restart() {
      await this.handlePost("restart");
    }

    async dump() {
      await this.handlePost("dump", { path: dumpFolderPath });
    }

    async load() {
      await this.handlePost("load", { path: dumpFolderPath });
    }

    async handlePost(path: string, payload?: RawArgs) {
      const url = `${this.channel.nodeUrl}/${path}`;
      const headers = { "Content-Type": "application/json" };
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      if (!response.ok) {
        throw new Error(`HTTP error! calling ${url} Status: ${response.status} Message: ${await response.text()}`);
      }
    }
  };
