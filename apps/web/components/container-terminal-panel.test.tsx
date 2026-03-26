// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContainerTerminalPanel } from "./container-terminal-panel";

class MockTerminal {
  cols = 80;
  rows = 24;

  loadAddon = vi.fn();
  open = vi.fn();
  write = vi.fn();
  clear = vi.fn();
  focus = vi.fn();
  dispose = vi.fn();

  onData(handler: (data: string) => void) {
    this.dataHandler = handler;
    return {
      dispose: vi.fn(),
    };
  }

  dataHandler: ((data: string) => void) | null = null;
}

class MockFitAddon {
  fit = vi.fn();
}

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly listeners = new Map<string, Array<(event: Event | MessageEvent<string> | CloseEvent) => void>>();
  readonly sent: string[] = [];
  readyState = MockWebSocket.CONNECTING;

  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit("open", new Event("open"));
    });
  }

  addEventListener(type: string, handler: (event: Event | MessageEvent<string> | CloseEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  send = vi.fn((payload: string) => {
    this.sent.push(payload);
  });

  emit(type: string, event: Event | MessageEvent<string> | CloseEvent) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

vi.mock("xterm", () => ({
  Terminal: MockTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: MockFitAddon,
}));

describe("ContainerTerminalPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.reset();
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the new window action in embedded mode and opens the focused terminal route with the selected shell", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <ContainerTerminalPanel
        containerIdOrName="postgres"
        containerName="postgres"
        containerState="running"
        terminalCommands={[{ label: "Shell (sh)", command: "docker exec -it postgres sh" }]}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "bash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open in new window" }));

    expect(openSpy).toHaveBeenCalledWith(
      "/terminal/containers/postgres?shell=bash&autoconnect=1",
      "_blank",
      "popup=yes,width=1280,height=900",
    );
  });

  it("auto-connects once in focused window mode after terminal initialization", async () => {
    const { rerender } = render(
      <ContainerTerminalPanel
        containerIdOrName="postgres"
        containerName="postgres"
        containerState="running"
        terminalCommands={[]}
        mode="window"
        initialShell="bash"
        autoConnectOnReady
      />,
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    await waitFor(() => {
      expect(MockWebSocket.instances[0]?.sent).toContain(JSON.stringify({ type: "start", shell: "bash", cols: 80, rows: 24 }));
    });

    rerender(
      <ContainerTerminalPanel
        containerIdOrName="postgres"
        containerName="postgres"
        containerState="running"
        terminalCommands={[]}
        mode="window"
        initialShell="bash"
        autoConnectOnReady
      />,
    );

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  it("keeps diagnostics and helper commands in embedded mode but hides them in focused window mode", () => {
    const { rerender } = render(
      <ContainerTerminalPanel
        containerIdOrName="postgres"
        containerName="postgres"
        containerState="running"
        terminalCommands={[{ label: "Shell (sh)", command: "docker exec -it postgres sh" }]}
      />,
    );

    expect(screen.getByText("Verbose diagnostics")).toBeTruthy();
    expect(screen.getByText("Fallback helper commands")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run diagnostics" })).toBeTruthy();

    rerender(
      <ContainerTerminalPanel
        containerIdOrName="postgres"
        containerName="postgres"
        containerState="running"
        terminalCommands={[{ label: "Shell (sh)", command: "docker exec -it postgres sh" }]}
        mode="window"
      />,
    );

    expect(screen.queryByText("Verbose diagnostics")).toBeNull();
    expect(screen.queryByText("Fallback helper commands")).toBeNull();
    expect(screen.queryByRole("button", { name: "Run diagnostics" })).toBeNull();
  });
});
