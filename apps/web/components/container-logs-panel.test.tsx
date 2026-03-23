// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContainerLogsPanel } from "./container-logs-panel";

class MockEventSource {
  static instances: MockEventSource[] = [];

  listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  onerror: (() => void) | null = null;

  close = vi.fn();

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  emit(type: string, payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>;
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

const respondWithJson = (payload: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(payload),
});

describe("ContainerLogsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.reset();
    global.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and searches the compact log view locally", async () => {
    global.fetch = vi.fn().mockImplementation(async () =>
      respondWithJson({
        entries: [
          {
            timestamp: "2026-03-17T12:00:00.000Z",
            stream: "stdout",
            message: "Server started",
          },
          {
            timestamp: "2026-03-17T12:00:01.000Z",
            stream: "stdout",
            message: "Worker ready",
          },
        ],
        truncated: false,
      }),
    ) as typeof fetch;

    render(<ContainerLogsPanel containerIdOrName="postgres" containerName="postgres" searchMode="compact" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:4000/api/containers/postgres/logs?tail=200", expect.any(Object));
    });

    fireEvent.change(screen.getByLabelText("Find log lines for postgres"), {
      target: { value: "server" },
    });

    expect(await screen.findByText("1 / 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open full log search" }).getAttribute("href")).toBe("/containers/postgres?tab=Logs");
  });

  it("loads advanced search results and navigates between matches", async () => {
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/logs/search?")) {
        return respondWithJson({
          containerIdOrName: "postgres",
          scanTail: 5000,
          truncated: false,
          matchCount: 2,
          matchIndexes: [1, 2],
          entries: [
            {
              timestamp: "2026-03-17T12:00:00.000Z",
              stream: "stdout",
              message: "Booting app",
            },
            {
              timestamp: "2026-03-17T12:00:01.000Z",
              stream: "stderr",
              message: "Database error",
            },
            {
              timestamp: "2026-03-17T12:00:02.000Z",
              stream: "stderr",
              message: "Secondary error",
            },
          ],
        });
      }

      return respondWithJson({
        entries: [
          {
            timestamp: "2026-03-17T12:00:00.000Z",
            stream: "stdout",
            message: "Server started",
          },
        ],
        truncated: false,
      });
    }) as typeof fetch;

    const { container } = render(<ContainerLogsPanel containerIdOrName="postgres" containerName="postgres" searchMode="advanced" />);

    expect(await screen.findByText("Server started")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search logs for postgres"), {
      target: { value: "error" },
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:4000/api/containers/postgres/logs/search?query=error&mode=plain&caseSensitive=false&scanTail=5000",
        expect.any(Object),
      );
    });

    await waitFor(() => {
      expect(container.querySelector(".max-h-96")?.textContent?.includes("Database error")).toBe(true);
    });
    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.click(screen.getByText("Next"));

    expect(await screen.findByText("2 / 2")).toBeTruthy();
  });

  it("clears advanced search and restores the snapshot log view", async () => {
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/logs/search?")) {
        return respondWithJson({
          containerIdOrName: "postgres",
          scanTail: 5000,
          truncated: false,
          matchCount: 1,
          matchIndexes: [0],
          entries: [
            {
              timestamp: "2026-03-17T12:00:01.000Z",
              stream: "stderr",
              message: "Database error",
            },
          ],
        });
      }

      return respondWithJson({
        entries: [
          {
            timestamp: "2026-03-17T12:00:00.000Z",
            stream: "stdout",
            message: "Server started",
          },
        ],
        truncated: false,
      });
    }) as typeof fetch;

    const { container } = render(<ContainerLogsPanel containerIdOrName="postgres" containerName="postgres" searchMode="advanced" />);

    expect(await screen.findByText("Server started")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search logs for postgres"), {
      target: { value: "error" },
    });

    await waitFor(() => {
      expect(container.querySelector(".max-h-96")?.textContent?.includes("Database error")).toBe(true);
    });

    fireEvent.click(screen.getByText("Clear"));

    expect(await screen.findByText("Server started")).toBeTruthy();
    expect(container.querySelector(".max-h-96")?.textContent?.includes("Database error")).toBe(false);
  });

  it("keeps live streaming active during advanced search and counts new matches without auto-scrolling", async () => {
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/logs/search?")) {
        return respondWithJson({
          containerIdOrName: "postgres",
          scanTail: 5000,
          truncated: false,
          matchCount: 1,
          matchIndexes: [1],
          entries: [
            {
              timestamp: "2026-03-17T12:00:00.000Z",
              stream: "stdout",
              message: "Booting app",
            },
            {
              timestamp: "2026-03-17T12:00:01.000Z",
              stream: "stderr",
              message: "Database error",
            },
          ],
        });
      }

      return respondWithJson({
        entries: [
          {
            timestamp: "2026-03-17T12:00:00.000Z",
            stream: "stdout",
            message: "Server started",
          },
        ],
        truncated: false,
      });
    }) as typeof fetch;

    const { container } = render(<ContainerLogsPanel containerIdOrName="postgres" containerName="postgres" searchMode="advanced" />);

    expect(await screen.findByText("Server started")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search logs for postgres"), {
      target: { value: "error" },
    });

    const viewport = container.querySelector(".max-h-96") as HTMLDivElement;
    await waitFor(() => {
      expect(viewport.textContent?.includes("Database error")).toBe(true);
    });
    expect(screen.getByText("1 / 1")).toBeTruthy();

    Object.defineProperty(viewport, "scrollHeight", {
      value: 999,
      configurable: true,
    });
    viewport.scrollTop = 0;

    fireEvent.click(screen.getByLabelText("Toggle live logs for postgres"));

    const source = MockEventSource.instances.at(-1);
    expect(source).toBeTruthy();

    source?.emit("snapshot", {
      entries: [
        {
          timestamp: "2026-03-17T12:00:00.000Z",
          stream: "stdout",
          message: "Server started",
        },
      ],
      truncated: false,
    });
    source?.emit("log", {
      timestamp: "2026-03-17T12:00:02.000Z",
      stream: "stderr",
      message: "Another error",
    });

    expect(await screen.findByText("1 / 2")).toBeTruthy();
    expect(viewport.textContent?.includes("Another error")).toBe(true);
    expect(viewport.scrollTop).toBe(0);
  });
});
