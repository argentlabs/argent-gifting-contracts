import { spawnSync } from "node:child_process";

const DEFAULT_DEVNET_URL = "http://127.0.0.1:5050";

function isLocalDevnetUrl(url: string) {
  return url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:");
}

async function isDevnetAlive(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const res = await fetch(`${baseUrl}/is_alive`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function canTalkToDocker(): boolean {
  const result = spawnSync("docker", ["info"], { stdio: "ignore" });
  return result.status === 0;
}

async function startDockerDesktopIfNeeded(): Promise<boolean> {
  if (canTalkToDocker()) return true;
  if (process.platform !== "darwin") return false;

  spawnSync("open", ["-a", "Docker"], { stdio: "ignore" });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (canTalkToDocker()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function main() {
  const rpcUrl = process.env.RPC_URL || DEFAULT_DEVNET_URL;
  if (!isLocalDevnetUrl(rpcUrl)) {
    // Integration tests can be pointed at a remote RPC; don't attempt docker in that case.
    return;
  }

  if (await isDevnetAlive(rpcUrl)) return;

  if (!(await startDockerDesktopIfNeeded())) {
    throw new Error(
      [
        "Docker is installed but the Docker daemon is not running.",
        "Start Docker Desktop (or your Docker daemon) and re-run the tests,",
        "or set RPC_URL to a reachable Starknet RPC (to avoid using docker).",
      ].join(" "),
    );
  }

  // Build (cached) and start the devnet container.
  run("docker", ["build", "-t", "devnet", "."]);

  // If the container is already running or the port is taken, this may fail; we'll still
  // proceed to waiting and surface a clear error if devnet never becomes reachable.
  try {
    run("docker", ["run", "-d", "--name", "devnet", "--rm", "-p", "127.0.0.1:5050:5050", "devnet"]);
  } catch {
    // ignore
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isDevnetAlive(rpcUrl)) return;
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Devnet did not become ready at ${rpcUrl} (expected GET /is_alive to succeed).`);
}

void main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
