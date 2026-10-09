import path from "node:path";
import Database from "better-sqlite3";

/**
 * Single shared SQLite connection, opened read-only, lazily on first use.
 * The database file is a static snapshot (hackathon.db) at the project root;
 * no writes are ever performed through this connection. Opening lazily (via
 * the Proxy below) means importing this module never touches the filesystem,
 * so `next build`'s page-data collection and any module that merely imports
 * `db` work even before hackathon.db exists.
 */
const DB_PATH = path.join(process.cwd(), "hackathon.db");

declare global {
  // eslint-disable-next-line no-var
  var __trustlensDb: Database.Database | undefined;
}

function openDb(): Database.Database {
  const instance = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  instance.pragma("query_only = true");
  return instance;
}

// Cached on globalThis so Next.js dev hot-reload doesn't open duplicate handles.
function getRealDb(): Database.Database {
  if (!globalThis.__trustlensDb) {
    globalThis.__trustlensDb = openDb();
  }
  return globalThis.__trustlensDb;
}

export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const real = getRealDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
