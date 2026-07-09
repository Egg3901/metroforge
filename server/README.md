# MetroForge backend

Accounts, leaderboards, campaign sync, and **full OSM replay verification**.
Zero external runtime deps — Node 22 `node:sqlite` / `node:http` / `node:crypto`.
Data in `server/data.db` (gitignored).

## Build the verifier (required once / after core changes)
```bash
npm run build:verify   # → server/lib/verify.mjs (~4 MB, bundles core + city JSON)
```

## Run
```bash
npm run build:verify   # if server/lib/verify.mjs is missing
node --experimental-sqlite server/index.mjs   # :3403
# or: npm run server
```

`GET /api/health` reports `{ verify: true }` when the verifier loaded.

## Deployed on Hetzner
- **systemd**: `/etc/systemd/system/metroforge-api.service` (Restart=always,
  `MF_SECRET` env set to a random secret). `systemctl status metroforge-api`.
- **Caddy**: `transit.[REDACTED]game.com` routes `handle /api/* → localhost:3403`,
  everything else → the game on `:3402`.
- Ship `server/lib/verify.mjs` with the deploy (or run `npm run build:verify` on the box).

## Endpoints
- `POST /api/register` `{name,password}` → `{token,name}`
- `POST /api/login` → `{token,name}`
- `POST /api/score` (Bearer) `{scenario,value,city,seed,stateHash,finalTick,commandCount,commandLog,difficulty,presetKey,rules}` —
  **re-sims the command log against OSM cities** and rejects hash mismatches
- `GET /api/leaderboard?scenario=<id>` → top 20 (`verified` flag)
- `GET /api/daily` → `{challengeId, dayKey, seed}`
- `GET /api/campaign` (Bearer) → `{stars}`
- `POST /api/campaign` (Bearer) `{stars}` → merged best-per-scenario `{stars}`
