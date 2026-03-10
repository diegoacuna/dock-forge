// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContainerSummary, GroupActionLaunch, GroupDetail, GroupRun, OrchestrationPlan } from "@dockforge/shared";
import * as api from "../../../lib/api";
import { GroupDetailPageContent } from "./group-detail-page-content";

const push = vi.fn();
const searchParamsState = new URLSearchParams();
const invalidateQueries = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
  useSearchParams: () => searchParamsState,
}));

vi.mock("../../../lib/api", () => ({
  fetchJson: vi.fn(),
  useApiQuery: vi.fn(),
}));

vi.mock("../../../components/group-detail-panels", () => ({
  ExecutionOrderPanel: () => <div>Execution order panel</div>,
  GroupAttachOnboardingCallout: () => <div>Attach onboarding</div>,
  GroupAttachPanel: () => <div>Attach panel</div>,
}));

vi.mock("../../../components/group-graph-panel", () => ({
  GroupGraphPanel: () => <div>Graph panel</div>,
}));

vi.mock("../../../components/grouped-containers-table", () => ({
  GroupedContainersTable: () => <div>Grouped containers table</div>,
}));

vi.mock("../../../components/status", () => ({
  StateBadge: ({ state }: { state: string }) => <div>{state}</div>,
}));

vi.mock("../../../components/ui", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      <div>{actions}</div>
    </div>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries,
    }),
  };
});

const group: GroupDetail = {
  id: "group-1",
  name: "Core Stack",
  slug: "core-stack",
  description: "Main services",
  color: "#123456",
  memberCount: 1,
  dependencyCount: 0,
  containers: [
    {
      id: "group-container-1",
      groupId: "group-1",
      containerKey: "api",
      containerNameSnapshot: "api-1",
      folderLabelSnapshot: "app",
      lastResolvedDockerId: "docker-1",
      aliasName: null,
      notes: null,
      includeInStartAll: true,
      includeInStopAll: true,
      runtimeState: "running",
      runtimeHealth: "healthy",
      runtimeStatusText: "Up",
      createdAt: "2026-03-09T12:00:00.000Z",
      updatedAt: "2026-03-09T12:00:00.000Z",
    },
  ],
  edges: [],
  layouts: [],
  executionStages: [],
  executionFolders: [],
  lastRunStatus: null,
  createdAt: "2026-03-09T12:00:00.000Z",
  updatedAt: "2026-03-09T12:00:00.000Z",
};

const containers: ContainerSummary[] = [
  {
    id: "runtime-1",
    containerKey: "api",
    name: "api-1",
    image: "ghcr.io/acme/api:latest",
    imageId: "sha256:123",
    state: "running",
    status: "Up 2 minutes",
    health: "healthy",
    createdAt: "2026-03-09T12:00:00.000Z",
    ports: [],
    compose: {
      project: "dock-forge",
      service: "api",
      workingDir: "/workspace/stacks/app",
      configFiles: [],
      rawLabels: {},
    },
    groupIds: ["group-1"],
    groupNames: ["Core Stack"],
  },
];

const runs: GroupRun[] = [];
const launchedRun: GroupRun = {
  id: "run-1",
  groupId: "group-1",
  action: "START",
  status: "PENDING",
  startedAt: "2026-03-10T12:00:00.000Z",
  completedAt: null,
  summaryJson: null,
  steps: [],
};

const launchResponse: GroupActionLaunch = {
  runId: "run-1",
  run: launchedRun,
};

const plan: OrchestrationPlan = {
  action: "START",
  targetGroupId: "group-1",
  targetGroupContainerId: null,
  layers: [],
  orderedGroupContainerIds: [],
};

describe("GroupDetailPage", () => {
  beforeEach(async () => {
    push.mockReset();
    invalidateQueries.mockReset();
    for (const key of [...searchParamsState.keys()]) {
      searchParamsState.delete(key);
    }

    vi.mocked(api.useApiQuery).mockImplementation((queryKey: unknown) => {
      const key = Array.isArray(queryKey) ? queryKey[0] : queryKey;

      if (key === "group") {
        return { data: group } as ReturnType<typeof api.useApiQuery>;
      }

      if (key === "containers") {
        return { data: containers } as ReturnType<typeof api.useApiQuery>;
      }

      if (key === "group-runs") {
        return { data: runs } as ReturnType<typeof api.useApiQuery>;
      }

      if (key === "group-plan") {
        return { data: plan } as ReturnType<typeof api.useApiQuery>;
      }

      return { data: undefined } as ReturnType<typeof api.useApiQuery>;
    });

    vi.mocked(api.fetchJson).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the requested tab from the url", async () => {
    searchParamsState.set("tab", "Execution Order");

    render(<GroupDetailPageContent resolvedParams={{ id: "group-1" }} />);

    expect(await screen.findByText("Execution order panel")).toBeTruthy();
  });

  it("pushes a new tab query param while preserving existing search params", async () => {
    searchParamsState.set("onboarding", "attach");

    render(<GroupDetailPageContent resolvedParams={{ id: "group-1" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Execution Order" }));

    expect(push).toHaveBeenCalledWith("/groups/group-1?onboarding=attach&tab=Execution+Order");
  });

  it("opens the orchestration modal immediately after starting the group", async () => {
    vi.mocked(api.fetchJson).mockResolvedValueOnce(launchResponse as never);

    render(<GroupDetailPageContent resolvedParams={{ id: "group-1" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Start Group" }));

    expect(await screen.findByText("Orchestration progress")).toBeTruthy();
    expect(await screen.findByText("Run run-1")).toBeTruthy();
    expect(api.fetchJson).toHaveBeenCalledWith(
      "/groups/group-1/start",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("polls the run detail and renders skipped steps as non-errors", async () => {
    vi.mocked(api.fetchJson)
      .mockResolvedValueOnce(launchResponse as never)
      .mockResolvedValueOnce({
        ...launchedRun,
        status: "SUCCEEDED",
        completedAt: "2026-03-10T12:01:00.000Z",
        steps: [
          {
            id: "step-1",
            groupRunId: "run-1",
            groupContainerId: "group-container-1",
            containerKey: "api",
            containerNameSnapshot: "api-1",
            action: "START",
            status: "SKIPPED",
            message: "Container docker-1 is already running",
            startedAt: "2026-03-10T12:00:10.000Z",
            completedAt: "2026-03-10T12:00:10.000Z",
            metadataJson: JSON.stringify({ noopReason: "already_running", runtimeStateBefore: "running", runtimeStateAfter: "running" }),
            metadata: {
              noopReason: "already_running",
              runtimeStateBefore: "running",
              runtimeStateAfter: "running",
            },
          },
        ],
      } as never);

    render(<GroupDetailPageContent resolvedParams={{ id: "group-1" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Start Group" }));
    await screen.findByText("Run run-1");

    await waitFor(() => {
      expect(screen.getByText("SKIPPED")).toBeTruthy();
      expect(screen.getByText("No Docker action was needed because the container was already running.")).toBeTruthy();
    }, { timeout: 2500 });
    expect(invalidateQueries).toHaveBeenCalled();
  });
});
