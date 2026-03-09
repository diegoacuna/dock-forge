import { describe, expect, it } from "vitest";
import {
  appendTerminalDiagnostic,
  formatTerminalDiagnosticDetail,
  getTerminalAvailabilityMessage,
  initialTerminalConnectionState,
  isTerminalConnectable,
  reduceTerminalConnectionState,
  toTerminalConnectionAction,
} from "./container-terminal";

describe("container terminal helpers", () => {
  it("maps terminal server messages into connection state transitions", () => {
    let state = reduceTerminalConnectionState(initialTerminalConnectionState, { type: "connect" });
    state = reduceTerminalConnectionState(
      state,
      toTerminalConnectionAction({ type: "ready", containerName: "postgres", shell: "sh" }) ?? { type: "disconnect" },
    );
    state = reduceTerminalConnectionState(
      state,
      toTerminalConnectionAction({ type: "exit", exitCode: 127 }) ?? { type: "disconnect" },
    );

    expect(state).toEqual({
      status: "exited",
      error: null,
      exitCode: 127,
    });
  });

  it("clears prior exit and error state when reconnecting", () => {
    const exitedState = reduceTerminalConnectionState(initialTerminalConnectionState, { type: "exit", exitCode: 1 });
    const reconnectingState = reduceTerminalConnectionState(exitedState, { type: "connect" });
    const erroredState = reduceTerminalConnectionState(reconnectingState, { type: "error", message: "boom" });
    const restartedState = reduceTerminalConnectionState(erroredState, { type: "connect" });

    expect(restartedState).toEqual({
      status: "connecting",
      error: null,
      exitCode: null,
    });
  });

  it("guards terminal access when the container is not running", () => {
    expect(isTerminalConnectable("running")).toBe(true);
    expect(isTerminalConnectable("exited")).toBe(false);
    expect(getTerminalAvailabilityMessage("paused")).toContain("paused");
  });

  it("records diagnostics entries in order and keeps close separate from error", () => {
    const entries = appendTerminalDiagnostic(
      appendTerminalDiagnostic(
        [],
        { source: "ws", event: "error", detail: "handshake failed" },
        () => "2026-03-08T00:00:00.000Z",
      ),
      { source: "ws", event: "close", detail: "code=1006" },
      () => "2026-03-08T00:00:01.000Z",
    );

    expect(entries).toEqual([
      {
        timestamp: "2026-03-08T00:00:00.000Z",
        source: "ws",
        event: "error",
        detail: "handshake failed",
      },
      {
        timestamp: "2026-03-08T00:00:01.000Z",
        source: "ws",
        event: "close",
        detail: "code=1006",
      },
    ]);
  });

  it("formats complex diagnostics payloads for verbose output", () => {
    expect(formatTerminalDiagnosticDetail({ ok: true, attempts: 1 })).toContain('"ok": true');
  });
});
