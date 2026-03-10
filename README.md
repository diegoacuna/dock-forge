# DockForge

Craft your local Docker empire—graph dependencies, auto-start stacks, and debug like a pro.

DockForge is a local Docker control center for a single trusted user. Use it to organize containers into app-managed groups, define dependency-aware orchestration, inspect live runtime state, and debug individual services without giving up direct access to Docker.

Container detail pages include a browser-based terminal for ephemeral `sh` or `bash` sessions, alongside raw inspect data and copyable Docker helper commands.

Docker remains the source of truth for runtime state; DockForge persists groups, membership, dependency graphs, graph layout, orchestration history, and first-run install settings in SQLite.

## Platform Highlights

- **Group orchestration**: Treat a group as the operational unit for `start`, `stop`, `restart`, and `start clean` workflows instead of managing every container one by one.
- **Custom dependency graph**: Define dependency edges inside the app, validate them as a DAG, and use that graph to derive execution order before anything runs.
- **Parallel execution stages**: Organize folders into stages so independent parts of the stack can execute in parallel while later stages wait for prerequisites.
- **Flexible membership**: Keep group membership in the app database, not Docker labels, and let the same container belong to multiple groups when that matches your workflow.
- **Fast attachment workflow**: Add one container at a time or bulk-attach all currently detected containers from a folder or working directory.
- **Terminal access and helper commands**: Open an in-browser terminal for ephemeral `sh` or `bash` sessions, or copy the Docker command you want to run yourself.
- **Direct Docker visibility**: Keep raw inspect JSON, logs, network detail, and volume detail close at hand instead of abstracting Docker away.
- **Run history and persisted state**: Store execution history, graph layout, install settings, and group metadata in SQLite so orchestration context survives app restarts.

## Architecture

- `apps/web`: Next.js frontend with Tailwind, TanStack Query, and React Flow.
- `apps/api`: Fastify API for Docker inventory, groups, graph editing, and orchestration.
- `packages/db`: Prisma schema, migrations, and client.
- `packages/shared`: shared Zod schemas and DTOs.
- `packages/docker-runtime`: Docker Engine adapter and runtime normalization.
- `packages/orchestrator`: DAG validation, execution planning, and orchestration execution.

## Prerequisites

- Node.js 20+ (Node.js 22+ recommended for self-contained SQLite migrations)
- pnpm 8+
- Docker Desktop or a local Docker Engine reachable from the current user
- Access to the Docker socket or daemon configured through `DOCKER_HOST` or `DOCKER_SOCKET_PATH`

DockForge is not the Docker host. It connects to your existing local Docker Engine and reads runtime state from there.

## Environment

1. Copy `.env.example` to `.env`.
2. Adjust values only if your local ports, Docker connection, or SQLite location differ from the defaults.
3. On first launch, DockForge opens an install page and stores the chosen Docker connection mode in the app database. Environment values remain the fallback before install is completed.

If you want a guided setup instead of handling each step manually, run `./install.sh` from the repo root. It checks prerequisites, writes `.env`, installs dependencies, applies migrations, completes the first-run install state, and can offer a `systemd` service on Ubuntu.
For upgrades on an existing production install, use `./update.sh` after you update the checkout. It preserves the current `.env`, applies dependency and schema changes, rebuilds the app, and restarts the service only after the update succeeds.

Default local values:

- `API_HOST=0.0.0.0`
- `API_PORT=4000`
- `WEB_HOST=0.0.0.0`
- `WEB_PORT=3000`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api`
- `DOCKER_SOCKET_PATH=/var/run/docker.sock`
- `DATABASE_URL` omitted, which falls back to `packages/db/dev.db`

`DATABASE_URL` is optional. If you omit it, DockForge falls back to `packages/db/dev.db`.
For production, prefer an absolute SQLite path such as `file:/data/code/dock-forge/packages/db/dev.db`.
`DOCKER_HOST` and `DOCKER_SOCKET_PATH` are also optional after first-run setup, but they still provide the initial fallback values used before install completes.

## Development

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm db:generate`.
4. Run database migrations with `pnpm db:migrate`.
5. Start the dev servers with `pnpm dev`.
6. Open `http://localhost:3000`.

`pnpm dev` loads the root `.env`, runs the Fastify API with file watching, and runs the Next.js development server.
By default both servers bind to `0.0.0.0`, so local custom hostnames that resolve to `127.0.0.1` can reach them.

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

`pnpm build` and `pnpm start` both load the root `.env`.
That matters for browser-facing values such as `NEXT_PUBLIC_API_BASE_URL`, which are embedded into the Next.js build output.
`pnpm start` starts the compiled API on port `4000` and starts the built Next.js server on port `3000`.

## Long-Lived Local Production

On Ubuntu, use a `systemd` service for long-lived local production instead of keeping a terminal open.

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm db:generate`.
4. Run database migrations with `pnpm db:migrate`.
5. Build the workspace with `pnpm build`.
6. Create `/etc/systemd/system/dockforge.service`:

```ini
[Unit]
Description=DockForge local production server
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=YOUR_UBUNTU_USER
WorkingDirectory=/absolute/path/to/dock-forge
Environment=NODE_ENV=production
Environment=PATH=/path/to/node/bin:/path/to/pnpm/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/absolute/path/to/pnpm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

7. Reload systemd and enable the service:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now dockforge
```

8. Open `http://localhost:3000` or your configured custom hostname.

Useful follow-up commands:

```sh
sudo systemctl status dockforge
sudo journalctl -u dockforge -f
sudo systemctl restart dockforge
sudo systemctl stop dockforge
```

This keeps DockForge running after you close the terminal, restarts it automatically if the process exits, and can start it automatically on boot.
If you installed Node.js or pnpm through `nvm`, `corepack`, or another user-local toolchain, use absolute binary paths or an explicit `PATH` in the service so `systemd` can find them.

If you only need a temporary background process, you can still use:

```sh
mkdir -p .logs
nohup pnpm start > .logs/dockforge.log 2>&1 & echo $! > .dockforge.pid
```

## Custom Local Domain

To use a hostname such as `forge.mylocal.dev` on your machine without a reverse proxy:

1. Add `127.0.0.1 forge.mylocal.dev` to `/etc/hosts`.
2. Set `NEXT_PUBLIC_API_BASE_URL=http://forge.mylocal.dev:4000/api` in `.env`.
3. Start DockForge with `pnpm dev` or `pnpm start`.
4. Open `http://forge.mylocal.dev:3000`.

You can also override bind settings explicitly:

- `WEB_HOST` controls the Next.js bind host.
- `WEB_PORT` controls the Next.js port.
- `API_HOST` controls the Fastify bind host.
- `API_PORT` controls the Fastify port.

If you later add Caddy, nginx, or another reverse proxy, you can keep these bindings and move the public URL to port `80` or `443`.

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

On Node.js 22+, the migrator uses Node's built-in SQLite support and does not require the `sqlite3` shell package. On older Node versions, install the `sqlite3` CLI before running `pnpm db:migrate`.
When `DATABASE_URL` uses a relative SQLite path, Prisma resolves it relative to `packages/db/prisma/schema.prisma`. For production, use an absolute path to avoid ambiguity.

## Upgrade Flow

When you pull new changes into an existing production clone:

1. Update the checkout separately using your usual release flow.
2. Run `./update.sh`.
3. Let the script apply dependencies, regenerate the Prisma client, run migrations, rebuild the workspace, and restart DockForge when a managed `systemd` service is present.

`./update.sh` is intentionally for an already-installed instance. It requires an existing root `.env` and existing SQLite database, does not call install completion again, and does not rewrite Docker connection settings.

Manual fallback:

1. `pnpm install`
2. `pnpm db:generate`
3. `pnpm db:migrate`
4. `pnpm build`
5. restart DockForge with either `sudo systemctl restart dockforge` or `pnpm start`, depending on how you run it

## Troubleshooting

- Docker connection errors: verify Docker is running and the current user can access the configured socket or daemon.
- API loads but the UI cannot reach it: confirm `NEXT_PUBLIC_API_BASE_URL` points to the same host and port as the API.
- Migration failures: rerun `pnpm db:generate` and `pnpm db:migrate`, then confirm `DATABASE_URL` points to a writable SQLite file location.
- Production build failures: run `pnpm build` first and fix the reported Next.js or TypeScript error before using `pnpm start`.

## Notes

- Group metadata is stored only in SQLite, never in Docker labels.
- Membership identity is based on canonical container name (`containerKey`), not ephemeral Docker IDs.
- MVP uses API polling for freshness. The Docker runtime package is structured so an events stream can be added later.
