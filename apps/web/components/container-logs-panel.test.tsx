// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContainerLogsPanel } from "./container-logs-panel";

describe("ContainerLogsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          entries: [
            {
              timestamp: "2026-03-17T12:00:00.000Z",
              stream: "stdout",
              message: "Server started",
            },
          ],
          truncated: false,
        }),
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and renders a snapshot of container logs", async () => {
    render(<ContainerLogsPanel containerIdOrName="postgres" containerName="postgres" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:4000/api/containers/postgres/logs?tail=200", expect.any(Object));
    });

    expect(await screen.findByText("Server started")).toBeTruthy();
    expect(screen.getByText("Logs for postgres")).toBeTruthy();
  });
});
