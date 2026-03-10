// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContainerSummary, GroupDetail, GroupRun, OrchestrationPlan } from "@dockforge/shared";
import GroupDetailPage from "./page";

const push = vi.fn();
const searchParamsState = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
  useSearchParams: () => searchParamsState,
}));

vi.mock("@/lib/api", () => ({
  fetchJson: vi.fn(),
  useApiQuery: vi.fn(),
}));

vi.mock("@/components/group-detail-panels", () => ({
  ExecutionOrderPanel: () => <div>Execution order panel</div>,
  GroupAttachOnboardingCallout: () => <div>Attach onboarding</div>,
  GroupAttachPanel: () => <div>Attach panel</div>,
}));

vi.mock("@/components/group-graph-panel", () => ({
  GroupGraphPanel: () => <div>Graph panel</div>,
}));

vi.mock("@/components/grouped-containers-table", () => ({
  GroupedContainersTable: () => <div>Grouped containers table</div>,
}));

vi.mock("@/components/status", () => ({
  StateBadge: ({ state }: { state: string }) => <div>{state}</div>,
}));

vi.mock("@/components/ui", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

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
    for (const key of [...searchParamsState.keys()]) {
      searchParamsState.delete(key);
    }

    const api = await import("@/lib/api");
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
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the requested tab from the url", async () => {
    searchParamsState.set("tab", "Execution Order");

    render(<GroupDetailPage params={Promise.resolve({ id: "group-1" })} />);

    expect(await screen.findByText("Execution order panel")).toBeTruthy();
  });

  it("pushes a new tab query param while preserving existing search params", async () => {
    searchParamsState.set("onboarding", "attach");

    render(<GroupDetailPage params={Promise.resolve({ id: "group-1" })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Execution Order" }));

    expect(push).toHaveBeenCalledWith("/groups/group-1?onboarding=attach&tab=Execution+Order");
  });
});
