import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DrizzleDb = NeonHttpDatabase<typeof schema>;

let _db: DrizzleDb | null = null;

function getInstance(): DrizzleDb {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

// Proxy so callers can use `db.select()` etc. without changing any import sites.
// The real drizzle instance is only created on first property access (at request time).
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const instance = getInstance();
    const value = instance[prop as keyof DrizzleDb];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});
