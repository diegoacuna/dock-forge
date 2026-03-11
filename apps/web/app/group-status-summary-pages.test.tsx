// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardData, GroupsPageData } from "@dockforge/shared";
import * as api from "../lib/api";
import DashboardPage from "./page";
import GroupsPage from "./groups/page";

const invalidateQueries = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("../lib/api", () => ({
  fetchJson: vi.fn(),
  useApiQuery: vi.fn(),
}));

vi.mock("../components/ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
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
  StatCard: ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
}));

vi.mock("../components/status", () => ({
  StateBadge: ({ state }: { state?: string }) => <span>{state ?? "unknown"}</span>,
}));

vi.mock("../components/dashboard-onboarding", () => ({
  DashboardOnboarding: () => <div>Dashboard onboarding</div>,
  DashboardOnboardingEmptyState: () => <div>Dashboard empty state</div>,
}));

vi.mock("../lib/onboarding", () => ({
  DASHBOARD_ONBOARDING_DISMISSED_KEY: "dashboard-onboarding-dismissed",
  shouldShowDashboardOnboarding: () => false,
  shouldShowGroupsOnboarding: () => false,
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

const groupsPageData: GroupsPageData = {
  groups: [
    {
      id: "group-1",
      name: "Core Stack",
      slug: "core-stack",
      description: null,
      color: "#123456",
      memberCount: 2,
      dependencyCount: 1,
      groupStatus: "running",
      lastRunStatus: "FAILED",
      createdAt: "2026-03-09T12:00:00.000Z",
      updatedAt: "2026-03-09T12:00:00.000Z",
    },
  ],
  onboarding: {
    groupsTourSeen: true,
    persistenceAvailable: true,
  },
};

const dashboardData: DashboardData = {
  totalContainers: 2,
  runningContainers: 2,
  stoppedContainers: 0,
  unhealthyContainers: 0,
  totalGroups: 1,
  recentGroupRuns: [],
  orphanContainers: 0,
  groups: groupsPageData.groups,
};

describe("group status summary pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(api.useApiQuery).mockImplementation((queryKey: unknown) => {
      const key = Array.isArray(queryKey) ? queryKey[0] : queryKey;

      if (key === "groups-page-data") {
        return { data: groupsPageData, isLoading: false, error: null } as ReturnType<typeof api.useApiQuery>;
      }

      if (key === "dashboard") {
        return { data: dashboardData } as ReturnType<typeof api.useApiQuery>;
      }

      return { data: undefined, isLoading: false, error: null } as ReturnType<typeof api.useApiQuery>;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows live group status on the groups page instead of last run status", async () => {
    render(<GroupsPage />);

    expect(await screen.findByText("running")).toBeTruthy();
    expect(screen.queryByText("failed")).toBeNull();
  });

  it("shows live group status on the dashboard group cards", async () => {
    render(<DashboardPage />);

    expect(await screen.findByText("running")).toBeTruthy();
    expect(screen.queryByText("failed")).toBeNull();
  });
});
