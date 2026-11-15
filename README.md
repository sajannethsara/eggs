# AK Enterprises Operations System

One shared core, five role-specific apps: Owner (phone), Office desktop, Cashier POS, Driver (phone), Warehouse (tablet).
Built from `docs/AK-Enterprises-Proposal.md`: six data units, every automated action held for human review, totals always calculated from movements.

## Stack

| Part | Choice |
|---|---|
| `apps/web` | Vite 8 · React 19 · TypeScript · Tailwind 4 · shadcn/ui (Amber theme) · react-router · TanStack Query · i18next (en/si) · PWA with an IndexedDB outbox (Dexie) for offline POS / driver / warehouse actions |
| `apps/api` | NestJS 12 · Prisma 7 (`@prisma/adapter-pg`) · zod validation · JWT auth · rules engine (proposes only) |
| `packages/shared` | Enums, zod schemas and money/date formatting used by both |
| `infra` | Docker Compose: PostgreSQL 16-alpine on **port 5433** |

## First run

```bash
pnpm setup        # install → start Postgres → build shared → prisma generate → migrate → seed
pnpm dev          # API on http://localhost:3001/api, web on http://localhost:5173
```

Or step by step: `pnpm install`, `pnpm db:up`, `pnpm --filter shared build`, `pnpm --filter api prisma:generate`, `pnpm --filter api exec prisma migrate dev`, `pnpm seed`, then `pnpm dev:api` and `pnpm dev:web` in two terminals.

Copy `apps/api/.env.example` to `apps/api/.env` if it is missing.

## Demo logins

Open http://localhost:5173, pick a role, tap a name:

| Role | Username | Secret |
|---|---|---|
| Owner | `kusal` | `owner123` |
| Office staff | `nimali`, `ruwan` | `office123` |
| Cashier (Outlet 1–5) | `cashier1` … `cashier5` | PIN `1234` |
| Driver | `saman`, `kamal` | PIN `1234` |
| Warehouse keeper | `priyantha` | PIN `1234` |

`pnpm seed` wipes and reloads two weeks of sales, today's routes, pending proposals in the inbox, and cheques.

## How it fits together

- **Request → Movement.** Rules and staff create *Proposed* requests. A person approves (`POST /requests/:id/decide`). Only approved requests produce movements; movements are never edited, only reversed.
- **Calculated views** (`/views/*`): stock per holder, freshness, balances, driver cash, profit, receivables — all derived, never stored.
- **Rules** run every 5 minutes (`RULES_INTERVAL_MS`, `0` disables) and on demand (`POST /rules/run`). Each rule counts edits and rejections so office staff can tune it.
- **Offline**: POS sales and driver stop completions carry a client-generated id; if the network is down they go to the outbox and `POST /movements/sync` replays them idempotently.

## Useful commands

```bash
pnpm typecheck            # all packages
pnpm lint                 # web + api
pnpm --filter api exec prisma studio
pnpm db:reset             # drop the volume and start fresh (then migrate + seed)
```

## Notes for this machine

- A native PostgreSQL already uses 5432, so the container maps to 5433.
- Port 3000 is used by another project, so the API runs on 3001 (`apps/api/.env`, `VITE_API_PROXY`).
- `lucide-react` is vendored at `vendor/lucide-react` because pnpm could not add its tarball to the store here.
