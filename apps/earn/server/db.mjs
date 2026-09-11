import pg from 'pg';

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[db] DATABASE_URL is not set');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: url,
  max: 8,
  idleTimeoutMillis: 30_000,
  ssl: /railway\.internal|localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});

pool.on('error', (e) => console.error('[db] pool error', e.message));

export const q = (text, params) => pool.query(text, params);

export async function migrate() {
  await q(`
    CREATE TABLE IF NOT EXISTS network_state (
      id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      started_at    timestamptz NOT NULL,
      version       int NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS network_samples (
      ts            timestamptz PRIMARY KEY,
      users         int NOT NULL,
      nodes         int NOT NULL,
      active_nodes  int NOT NULL,
      gb_total      double precision NOT NULL,
      gross_usd     double precision NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id                 text PRIMARY KEY,
      email              text,
      wallet             text,
      display_name       text,
      referral_code      text UNIQUE,
      referred_by        text,
      allocation         int NOT NULL DEFAULT 25,
      monthly_budget_gb  int,
      auto_payout_usd    int,
      created_at         timestamptz NOT NULL DEFAULT now(),
      last_seen_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id             uuid PRIMARY KEY,
      user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           text NOT NULL,
      token_hash     text NOT NULL UNIQUE,
      user_agent     text,
      version        text,
      allocation     int,
      capacity_mbps  double precision,
      paused         boolean NOT NULL DEFAULT false,
      seed           double precision NOT NULL,
      created_at     timestamptz NOT NULL DEFAULT now(),
      last_seen_at   timestamptz,
      last_mbps      double precision NOT NULL DEFAULT 0,
      total_bytes    bigint NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id);

    CREATE TABLE IF NOT EXISTS pair_codes (
      code        text PRIMARY KEY,
      user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  timestamptz NOT NULL,
      used_at     timestamptz
    );

    CREATE TABLE IF NOT EXISTS node_samples (
      id         bigserial PRIMARY KEY,
      device_id  uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      ts         timestamptz NOT NULL DEFAULT now(),
      seconds    int NOT NULL,
      bytes      bigint NOT NULL,
      mbps       double precision NOT NULL
    );
    CREATE INDEX IF NOT EXISTS node_samples_device_ts ON node_samples(device_id, ts DESC);

    CREATE TABLE IF NOT EXISTS earnings (
      user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id  uuid NOT NULL,
      hour       timestamptz NOT NULL,
      bytes      bigint NOT NULL DEFAULT 0,
      usd        double precision NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, device_id, hour)
    );
    CREATE INDEX IF NOT EXISTS earnings_user_hour ON earnings(user_id, hour DESC);

    CREATE TABLE IF NOT EXISTS payouts (
      id          bigserial PRIMARY KEY,
      user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      usd         double precision NOT NULL,
      wallet      text NOT NULL,
      status      text NOT NULL DEFAULT 'pending',
      created_at  timestamptz NOT NULL DEFAULT now()
    );

    -- v2: payout rails (USDC on Base / USDG on Robinhood Chain)
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS payout_rail text NOT NULL DEFAULT 'base-usdc';
    ALTER TABLE payouts ADD COLUMN IF NOT EXISTS rail text NOT NULL DEFAULT 'base-usdc';
    ALTER TABLE payouts ADD COLUMN IF NOT EXISTS tx_hash text;

    -- v3: real on-chain transfers from the treasury (see payer.mjs)
    CREATE TABLE IF NOT EXISTS treasury_txs (
      id            bigserial PRIMARY KEY,
      rail          text NOT NULL,
      to_addr       text NOT NULL,
      usd           double precision NOT NULL,
      amount_raw    text NOT NULL,
      tx_hash       text NOT NULL UNIQUE,
      status        text NOT NULL DEFAULT 'sent',
      kind          text NOT NULL DEFAULT 'node',
      payout_id     bigint,
      block         bigint,
      created_at    timestamptz NOT NULL DEFAULT now(),
      confirmed_at  timestamptz
    );
    CREATE INDEX IF NOT EXISTS treasury_txs_created ON treasury_txs(created_at DESC);
  `);
}
