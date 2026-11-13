import { execSync } from "node:child_process";

const TEST_DB_URL = "postgresql://jobflow:jobflow@localhost:5432/jobflow_test?schema=public";

// Runs once before the whole suite: create the test database (if missing) and
// push the Prisma schema into it. Requires the docker Postgres (jobflow-db) up.
export default function setup() {
  try {
    execSync(
      `docker exec jobflow-db psql -U jobflow -d jobflow -tc "SELECT 1 FROM pg_database WHERE datname='jobflow_test'" | grep -q 1 || docker exec jobflow-db psql -U jobflow -d jobflow -c "CREATE DATABASE jobflow_test"`,
      { stdio: "ignore", shell: "/bin/bash" },
    );
  } catch {
    throw new Error(
      "Could not create test database. Is the Postgres container (jobflow-db) running? `docker compose up -d db`",
    );
  }
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });

  // Hard, database-level safety timeouts applied to EVERY connection to the test
  // DB (including Prisma's forked clients). These guarantee the suite can never
  // deadlock indefinitely: a runaway statement aborts after 20s, a connection
  // left idle inside a transaction (which would hold locks and block TRUNCATE) is
  // killed after 15s, and a statement waiting on a lock gives up after 8s. The
  // result is a test that fails loudly in seconds rather than a suite that hangs.
  // These are a SAFETY NET against an indefinite hang (the suite once deadlocked
  // for ~13h), not a tight per-op budget. They must be loose enough that a merely
  // slow-but-progressing statement under load is never aborted — otherwise they
  // manufacture false failures. A genuinely stuck statement/lock still aborts
  // within a couple of minutes, so the suite fails loudly instead of hanging.
  const guards = [
    "ALTER DATABASE jobflow_test SET statement_timeout = '120s'",
    "ALTER DATABASE jobflow_test SET idle_in_transaction_session_timeout = '90s'",
    "ALTER DATABASE jobflow_test SET lock_timeout = '45s'",
  ];
  for (const g of guards) {
    execSync(`docker exec jobflow-db psql -U jobflow -d jobflow -c ${JSON.stringify(g)}`, { stdio: "ignore" });
  }
}
