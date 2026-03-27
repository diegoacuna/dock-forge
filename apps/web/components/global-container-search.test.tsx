// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContainerSummary, Group, GroupsPageData } from "@dockforge/shared";
import * as api from "../lib/api";
import { GlobalContainerSearch } from "./global-container-search";

const push = vi.fn();
let pathname = "/";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
  usePathname: () => pathname,
}));

vi.mock("../lib/api", () => ({
  useApiQuery: vi.fn(),
}));

const container: ContainerSummary = {
  id: "container-1",
  containerKey: "misc-api",
  name: "misc-api",
  image: "ghcr.io/acme/misc-api:latest",
  imageId: "sha256:123",
  state: "running",
  status: "Up 2 minutes",
  health: "healthy",
  createdAt: "2026-03-25T18:00:00.000Z",
  ports: [],
  compose: {
    project: "misc",
    service: "api",
    workingDir: "/workspace/misc",
    configFiles: [],
    rawLabels: {},
  },
  groupIds: ["group-1"],
  groupNames: ["Misc"],
};

const group: Group = {
  id: "group-1",
  name: "Misc",
  slug: "misc",
  description: "General purpose services",
  color: null,
  memberCount: 2,
  dependencyCount: 1,
  groupStatus: "running",
  lastRunStatus: null,
  createdAt: "2026-03-25T18:00:00.000Z",
  updatedAt: "2026-03-25T18:00:00.000Z",
};

const groupsPageData: GroupsPageData = {
  groups: [group],
  onboarding: {
    groupsTourSeen: false,
    persistenceAvailable: true,
  },
};

const mockSearchQueries = ({
  containers = [container],
  groups = groupsPageData,
  containersLoading = false,
  groupsLoading = false,
  containersError,
  groupsError,
}: {
  containers?: ContainerSummary[];
  groups?: GroupsPageData;
  containersLoading?: boolean;
  groupsLoading?: boolean;
  containersError?: Error;
  groupsError?: Error;
} = {}) => {
  vi.mocked(api.useApiQuery).mockImplementation((queryKey: unknown) => {
    const key = Array.isArray(queryKey) ? queryKey[1] : queryKey;

    if (key === "containers") {
      return {
        data: containers,
        isLoading: containersLoading,
        error: containersError,
      } as unknown as ReturnType<typeof api.useApiQuery>;
    }

    if (key === "groups") {
      return {
        data: groups,
        isLoading: groupsLoading,
        error: groupsError,
      } as unknown as ReturnType<typeof api.useApiQuery>;
    }

    return {
      data: undefined,
      isLoading: false,
      error: undefined,
    } as unknown as ReturnType<typeof api.useApiQuery>;
  });
};

describe("GlobalContainerSearch", () => {
  beforeEach(() => {
    push.mockReset();
    pathname = "/";
    vi.mocked(api.useApiQuery).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders group and group-section results distinctly", () => {
    mockSearchQueries();
    render(<GlobalContainerSearch />);

    fireEvent.click(screen.getByRole("button", { name: "Open global search" }));
    fireEvent.change(screen.getByLabelText("Search containers and groups"), { target: { value: "misc graph" } });

    expect(screen.getByText("Group section")).toBeTruthy();
    expect(screen.getByText("Group")).toBeTruthy();
    expect(screen.getByText("Graph")).toBeTruthy();
  });

  it("pushes the group overview route when the main group result is selected", () => {
    mockSearchQueries();
    render(<GlobalContainerSearch />);

    fireEvent.click(screen.getByRole("button", { name: "Open global search" }));
    fireEvent.change(screen.getByLabelText("Search containers and groups"), { target: { value: "misc" } });
    fireEvent.keyDown(screen.getByLabelText("Search containers and groups"), { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/groups/group-1");
  });

  it("pushes the group section route when a section shortcut is selected", () => {
    mockSearchQueries();
    render(<GlobalContainerSearch />);

    fireEvent.click(screen.getByRole("button", { name: "Open global search" }));
    fireEvent.change(screen.getByLabelText("Search containers and groups"), { target: { value: "misc graph" } });
    fireEvent.keyDown(screen.getByLabelText("Search containers and groups"), { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/groups/group-1?tab=Graph");
  });

  it("shows loading and error states across both data sources", () => {
    mockSearchQueries({ containersLoading: true, groupsLoading: true });
    const { rerender } = render(<GlobalContainerSearch />);

    fireEvent.click(screen.getByRole("button", { name: "Open global search" }));
    expect(screen.getByText("Loading search index…")).toBeTruthy();

    mockSearchQueries({ groupsError: new Error("Groups failed to load") });
    rerender(<GlobalContainerSearch />);

    expect(screen.getByText("Groups failed to load")).toBeTruthy();
  });
});
