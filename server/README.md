# MetroForge backend

Accounts + leaderboards + daily challenge metadata. Zero external deps — Node 22
built-in `node:sqlite`, `node:http`, `node:crypto`. Data in `server/data.db`
(gitignored).

## Run
    node --experimental-sqlite server/index.mjs   # listens on 127.0.0.1:3403

## Deployed on Hetzner
- **systemd**: `/etc/systemd/system/metroforge-api.service` (Restart=always,
  `MF_SECRET` env set to a random secret). `systemctl status metroforge-api`.
- **Caddy**: `transit.[REDACTED]game.com` routes `handle /api/* → localhost:3403`,
  everything else → the game on `:3402`.

## Endpoints
- `POST /api/register` `{name,password}` → `{token,name}`
- `POST /api/login` → `{token,name}`
- `POST /api/score` (Bearer) `{scenario,value,city,seed,stateHash,finalTick,commandCount,commandLog?}` —
  keeps the best per user; stores replay envelope for audit
- `GET /api/leaderboard?scenario=<id>` → top 20
- `GET /api/daily` → `{challengeId, dayKey, seed}` for today's shared challenge
