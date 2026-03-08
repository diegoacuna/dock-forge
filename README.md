# DockForge

Craft your local Docker empire—graph dependencies, auto-start stacks, and debug like a pro.

DockForge is a local-only Docker orchestration dashboard for a single trusted user. Docker remains the source of truth for runtime state; DockForge persists groups, membership, dependency graphs, graph layout, and orchestration history in SQLite.

## Architecture

- `apps/web`: Next.js frontend with Tailwind, TanStack Query, and React Flow.
- `apps/api`: Fastify API for Docker inventory, groups, graph editing, and orchestration.
- `packages/db`: Prisma schema, migrations, and client.
- `packages/shared`: shared Zod schemas and DTOs.
- `packages/docker-runtime`: Docker Engine adapter and runtime normalization.
- `packages/orchestrator`: DAG validation, execution planning, and orchestration execution.

## Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm db:generate`.
3. Run database migrations with `pnpm db:migrate`.
4. Start the app with `pnpm dev`.
5. Open `http://localhost:3000`.

The API defaults to `http://localhost:4000`, and Docker connectivity uses `DOCKER_HOST` or `DOCKER_SOCKET_PATH`.
The database defaults to `packages/db/dev.db`, so `DATABASE_URL` is optional unless you want a custom location.

## Commands

- `pnpm dev`: run web and api in parallel
- `pnpm build`: build all packages/apps
- `pnpm typecheck`: run TypeScript across the workspace
- `pnpm test`: run tests across the workspace
- `pnpm db:generate`: generate Prisma client
- `pnpm db:migrate`: apply Prisma migrations

## Database note

DockForge keeps a Prisma schema and generated Prisma client, but this environment hit a Prisma SQLite schema-engine issue when applying migrations. The repo therefore uses a checked-in SQL migration plus a small TypeScript migrator to create the SQLite schema reproducibly while preserving Prisma for the data model and runtime client.

## Notes

- Group metadata is stored only in SQLite, never in Docker labels.
- Membership identity is based on canonical container name (`containerKey`), not ephemeral Docker IDs.
- MVP uses API polling for freshness. The Docker runtime package is structured so an events stream can be added later.
