# AGENTS.md

## Core principles

- Use TypeScript everywhere.
- Build a real MVP, not a throwaway demo.
- Keep Docker runtime concerns separate from app-domain concerns.
- Docker is the source of truth for runtime state only.
- The app database is the source of truth for groups, membership, dependency graphs, and run history.
- Do not write group/orchestration metadata into Docker labels.
- Groups are fully app-managed.
- The same container may belong to multiple groups.
- Dependencies are group-specific.
- Preserve access to raw Docker inspect JSON in the UI.
- For MVP, terminal access should first be implemented as copyable helper commands.
- Validate dependency graphs as DAGs and prevent cycles.
- Favor maintainability over cleverness.
- Keep README and env examples updated.
- Add tests for graph validation and orchestration ordering.

## Architecture

- Separate packages/apps for frontend, backend, DB, Docker runtime, and orchestration logic.
- Docker runtime layer must not know about app groups.
- Orchestration engine must work from app membership + dependency graph + resolved runtime containers.
- UI should consume clean API endpoints, not Docker directly.

## Product rules

- Group membership is stored in the app database only.
- A container can be in many groups.
- Dependency edges are scoped to a group.
- Persistent membership should not rely only on ephemeral Docker IDs.
- Prefer a stable container key strategy using container names, with last-known Docker ID as runtime metadata.

## UX rules

- The group detail page is the centerpiece.
- The graph view must be useful, not decorative.
- Node state should reflect runtime status when possible.
- Raw inspect data must always be accessible.
