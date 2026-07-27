import { config } from "dotenv";
import { resolve } from "node:path";

export function loadEnvironment(cwd = process.cwd()): void {
  config({ path: resolve(cwd, ".env.local"), override: false, quiet: true });
  config({ path: resolve(cwd, ".env"), override: false, quiet: true });
}

loadEnvironment();
