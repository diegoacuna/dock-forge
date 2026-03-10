// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallStatus } from "@dockforge/shared";
import { InstallFlow } from "./install-flow";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

const installStatus: InstallStatus = {
  installCompleted: false,
  persistenceAvailable: true,
  config: {
    dockerConnectionMode: "socket",
    dockerSocketPath: "/var/run/docker.sock",
    dockerHost: null,
  },
};

describe("InstallFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          installCompleted: true,
          persistenceAvailable: true,
          config: installStatus.config,
        }),
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
  });

  it("starts on the welcome step and reveals the docker config step after continuing", () => {
    render(<InstallFlow initialStatus={installStatus} />);

    expect(screen.getByText("Welcome to DockForge.")).toBeTruthy();
    expect(screen.queryByDisplayValue("/var/run/docker.sock")).toBeNull();

    fireEvent.click(screen.getByText("Next: configure Docker"));

    expect(screen.getByText("Connect DockForge to your Docker engine")).toBeTruthy();
    expect(screen.getByDisplayValue("/var/run/docker.sock")).toBeTruthy();
  });

  it("submits install settings and redirects to the dashboard from the second step", async () => {
    render(<InstallFlow initialStatus={installStatus} />);

    fireEvent.click(screen.getByText("Next: configure Docker"));
    fireEvent.click(screen.getByText("Finish install"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith("/");
    });
  });
});
