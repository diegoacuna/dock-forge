# DockForge

Craft your local Docker empire—graph dependencies, auto-start stacks, and debug like a pro.

DockForge is a local-only Docker orchestration dashboard for a single trusted user. Docker remains the source of truth for runtime state; DockForge persists groups, membership, dependency graphs, graph layout, orchestration history, and first-run install settings in SQLite.

Container detail pages include a browser-based terminal for ephemeral `sh` or `bash` sessions, alongside raw inspect data and copyable Docker helper commands.

## Architecture

- `apps/web`: Next.js frontend with Tailwind, TanStack Query, and React Flow.
- `apps/api`: Fastify API for Docker inventory, groups, graph editing, and orchestration.
- `packages/db`: Prisma schema, migrations, and client.
- `packages/shared`: shared Zod schemas and DTOs.
- `packages/docker-runtime`: Docker Engine adapter and runtime normalization.
- `packages/orchestrator`: DAG validation, execution planning, and orchestration execution.

## Prerequisites

- Node.js 20+
- pnpm 8+
- Docker Desktop or a local Docker Engine reachable from the current user
- Access to the Docker socket or daemon configured through `DOCKER_HOST` or `DOCKER_SOCKET_PATH`

DockForge is not the Docker host. It connects to your existing local Docker Engine and reads runtime state from there.

## Environment

1. Copy `.env.example` to `.env`.
2. Adjust values only if your local ports, Docker connection, or SQLite location differ from the defaults.
3. On first launch, DockForge opens an install page and stores the chosen Docker connection mode in the app database. Environment values remain the fallback before install is completed.

Default local values:

- `API_PORT=4000`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api`
- `DOCKER_SOCKET_PATH=/var/run/docker.sock`
- `DATABASE_URL=file:./packages/db/dev.db`

`DATABASE_URL` is optional. If you omit it, DockForge falls back to `packages/db/dev.db`.
`DOCKER_HOST` and `DOCKER_SOCKET_PATH` are also optional after first-run setup, but they still provide the initial fallback values used before install completes.

## Development

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm db:generate`.
4. Run database migrations with `pnpm db:migrate`.
5. Start the dev servers with `pnpm dev`.
6. Open `http://localhost:3000`.

`pnpm dev` loads the root `.env`, runs the Fastify API with file watching, and runs the Next.js development server.

## Local Production

“Production” in this repo means:

- optimized Next.js build output
- compiled API output
- no file watchers
- still intended for trusted local use on a developer machine

Use this flow on a fresh clone when you want to run the built app locally:

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm db:generate`.
4. Run database migrations with `pnpm db:migrate`.
5. Build the workspace with `pnpm build`.
6. Start the production servers with `pnpm start`.
7. Open `http://localhost:3000`.

`pnpm start` loads the root `.env`, starts the compiled API on port `4000`, and starts the built Next.js server on port `3000`.

## Commands

- `pnpm dev`: run web and api in parallel
- `pnpm build`: build all packages/apps
- `pnpm start`: run the compiled api and built web app for local production use
- `pnpm start:prod`: explicit alias for the local production runner
- `pnpm typecheck`: run TypeScript across the workspace
- `pnpm test`: run tests across the workspace
- `pnpm db:generate`: generate Prisma client
- `pnpm db:migrate`: apply Prisma migrations

## Database note

DockForge keeps a Prisma schema and generated Prisma client, but this environment hit a Prisma SQLite schema-engine issue when applying migrations. The repo therefore uses a checked-in SQL migration plus a small TypeScript migrator to create the SQLite schema reproducibly while preserving Prisma for the data model and runtime client.

## Upgrade Flow

When you pull new changes into an existing clone:

1. `pnpm install`
2. `pnpm db:generate`
3. `pnpm db:migrate`
4. `pnpm build`
5. restart `pnpm start`

## Troubleshooting

- Docker connection errors: verify Docker is running and the current user can access the configured socket or daemon.
- API loads but the UI cannot reach it: confirm `NEXT_PUBLIC_API_BASE_URL` points to the same host and port as the API.
- Migration failures: rerun `pnpm db:generate` and `pnpm db:migrate`, then confirm `DATABASE_URL` points to a writable SQLite file location.
- Production build failures: run `pnpm build` first and fix the reported Next.js or TypeScript error before using `pnpm start`.

## Notes

- Group metadata is stored only in SQLite, never in Docker labels.
- Membership identity is based on canonical container name (`containerKey`), not ephemeral Docker IDs.
- MVP uses API polling for freshness. The Docker runtime package is structured so an events stream can be added later.
