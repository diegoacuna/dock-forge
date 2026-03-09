"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  terminalServerMessageSchema,
  type TerminalDebugSnapshot,
  type ContainerState,
  type TerminalCommand,
  type TerminalShell,
} from "@dockforge/shared";
import { buildSocketUrl, fetchJson } from "../lib/api";
import {
  appendTerminalDiagnostic,
  formatTerminalDiagnosticDetail,
  getTerminalAvailabilityMessage,
  initialTerminalConnectionState,
  isTerminalConnectable,
  reduceTerminalConnectionState,
  type TerminalDiagnosticEntry,
  toTerminalConnectionAction,
} from "../lib/container-terminal";
import { Button, CopyButton, Panel, Select } from "./ui";

type XTermInstance = import("xterm").Terminal;
type FitAddonInstance = import("@xterm/addon-fit").FitAddon;

const terminalTheme = {
  background: "#020617",
  foreground: "#e2e8f0",
  cursor: "#f97316",
  black: "#0f172a",
  red: "#fb7185",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e2e8f0",
  brightBlack: "#475569",
  brightRed: "#fda4af",
  brightGreen: "#86efac",
  brightYellow: "#fcd34d",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#f8fafc",
};

const writeTerminalLine = (terminal: XTermInstance | null, text: string) => {
  terminal?.write(`${text}\r\n`);
};

export const ContainerTerminalPanel = ({
  containerIdOrName,
  containerName,
  containerState,
  terminalCommands,
}: {
  containerIdOrName: string;
  containerName: string;
  containerState: ContainerState;
  terminalCommands: TerminalCommand[];
}) => {
  const [shell, setShell] = useState<TerminalShell>("sh");
  const [state, dispatch] = useReducer(reduceTerminalConnectionState, initialTerminalConnectionState);
  const [diagnostics, setDiagnostics] = useState<TerminalDiagnosticEntry[]>([]);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTermInstance | null>(null);
  const fitAddonRef = useRef<FitAddonInstance | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const expectedCloseRef = useRef(false);
  const stateRef = useRef(state);

  stateRef.current = state;

  const isConnectable = isTerminalConnectable(containerState);
  const availabilityMessage = getTerminalAvailabilityMessage(containerState);
  const socketUrl = buildSocketUrl(`/containers/${encodeURIComponent(containerIdOrName)}/terminal/ws`);

  const logDiagnostic = (source: TerminalDiagnosticEntry["source"], event: string, detail: unknown) => {
    setDiagnostics((current) =>
      appendTerminalDiagnostic(current, {
        source,
        event,
        detail: formatTerminalDiagnosticDetail(detail),
      }),
    );
  };

  const closeSocket = (expected = true) => {
    expectedCloseRef.current = expected;
    socketRef.current?.close();
    socketRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    let cleanupDataListener: { dispose: () => void } | null = null;

    const setupTerminal = async () => {
      const host = terminalHostRef.current;
      if (!host) {
        return;
      }

      const [{ Terminal }, { FitAddon }] = await Promise.all([import("xterm"), import("@xterm/addon-fit")]);

      if (cancelled) {
        return;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: '"SFMono-Regular", "SF Mono", ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 1.3,
        theme: terminalTheme,
      });
      const fitAddon = new FitAddon();

      terminal.loadAddon(fitAddon);
      terminal.open(host);
      fitAddon.fit();
      writeTerminalLine(terminal, `DockForge terminal ready for ${containerName}.`);
      writeTerminalLine(terminal, "Choose a shell and connect to start an interactive session.");

      cleanupDataListener = terminal.onData((data) => {
        if (stateRef.current.status !== "connected" || socketRef.current?.readyState !== WebSocket.OPEN) {
          return;
        }

        socketRef.current.send(JSON.stringify({ type: "input", data }));
      });

      const observer = new ResizeObserver(() => {
        fitAddon.fit();
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: "resize",
              cols: Math.max(terminal.cols, 1),
              rows: Math.max(terminal.rows, 1),
            }),
          );
        }
      });

      observer.observe(host);
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      resizeObserverRef.current = observer;
    };

    void setupTerminal();

    return () => {
      cancelled = true;
      cleanupDataListener?.dispose();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      closeSocket();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [containerName]);

  const openTerminalSocket = ({ diagnosticsMode = false }: { diagnosticsMode?: boolean } = {}) => {
    if (!isConnectable || !terminalRef.current) {
      return;
    }

    closeSocket();
    terminalRef.current.clear();
    writeTerminalLine(
      terminalRef.current,
      diagnosticsMode ? `Running diagnostics for ${containerName} with ${shell}...` : `Connecting to ${containerName} with ${shell}...`,
    );
    dispatch({ type: "connect" });
    logDiagnostic("ui", diagnosticsMode ? "diagnostics-connect" : "connect", {
      containerName,
      shell,
      socketUrl,
      origin: window.location.origin,
      location: window.location.href,
    });

    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;
    logDiagnostic("ws", "created", { readyState: socket.readyState, socketUrl });

    socket.addEventListener("open", () => {
      logDiagnostic("ws", "open", { readyState: socket.readyState });
      fitAddonRef.current?.fit();
      const startPayload = {
        type: "start" as const,
        shell,
        cols: Math.max(terminalRef.current?.cols ?? 0, 1),
        rows: Math.max(terminalRef.current?.rows ?? 0, 1),
      };
      logDiagnostic("ui", "start-sent", startPayload);
      socket.send(JSON.stringify(startPayload));
    });

    socket.addEventListener("message", (event) => {
      try {
        const parsed = terminalServerMessageSchema.parse(JSON.parse(String(event.data)));
        logDiagnostic("ws", "message", parsed);

        if (parsed.type === "output") {
          terminalRef.current?.write(parsed.data);
        }

        const action = toTerminalConnectionAction(parsed);
        if (action) {
          dispatch(action);
        }

        if (parsed.type === "ready") {
          writeTerminalLine(terminalRef.current, `Connected to ${parsed.containerName} (${parsed.shell}).`);
          terminalRef.current?.focus();
        }

        if (parsed.type === "exit") {
          writeTerminalLine(
            terminalRef.current,
            parsed.exitCode == null ? "[terminal exited]" : `[terminal exited with code ${parsed.exitCode}]`,
          );
          closeSocket();
        }

        if (parsed.type === "error") {
          writeTerminalLine(terminalRef.current, `[error] ${parsed.message}`);
          closeSocket();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse terminal message";
        dispatch({ type: "error", message });
        writeTerminalLine(terminalRef.current, `[error] ${message}`);
        closeSocket();
      }
    });

    socket.addEventListener("error", () => {
      logDiagnostic("ws", "error", { readyState: socket.readyState });
      dispatch({ type: "error", message: `Terminal connection failed for ${containerName}` });
      writeTerminalLine(terminalRef.current, `[error] Terminal connection failed for ${containerName}`);
      closeSocket();
    });

    socket.addEventListener("close", (event) => {
      logDiagnostic("ws", "close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        readyState: socket.readyState,
      });
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      if (expectedCloseRef.current) {
        expectedCloseRef.current = false;
        return;
      }

      if (stateRef.current.status === "connecting" || stateRef.current.status === "connected") {
        dispatch({ type: "error", message: `Terminal connection closed for ${containerName}` });
        writeTerminalLine(terminalRef.current, `[error] Terminal connection closed for ${containerName}`);
      }
    });
  };

  const connectTerminal = () => {
    void openTerminalSocket();
  };

  const runDiagnostics = async () => {
    setDiagnostics([]);
    logDiagnostic("ui", "diagnostics-start", {
      containerIdOrName,
      containerName,
      containerState,
      shell,
      socketUrl,
      origin: window.location.origin,
      location: window.location.href,
    });

    try {
      const snapshot = await fetchJson<TerminalDebugSnapshot>(`/containers/${encodeURIComponent(containerIdOrName)}/terminal/debug`);
      logDiagnostic("api-preflight", "preflight", snapshot);
    } catch (error) {
      logDiagnostic("api-preflight", "preflight-error", error instanceof Error ? error.message : "Unknown preflight error");
    }

    openTerminalSocket({ diagnosticsMode: true });
  };

  const disconnectTerminal = () => {
    closeSocket();
    dispatch({ type: "disconnect" });
    logDiagnostic("ui", "disconnect", { socketUrl });
    writeTerminalLine(terminalRef.current, "[disconnected]");
  };

  const clearTerminal = () => {
    terminalRef.current?.clear();
  };

  const isActiveConnection = state.status === "connecting" || state.status === "connected";

  return (
    <div className="space-y-4">
      <Panel className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Interactive terminal</p>
            <p className="text-xs text-slate-500">
              A live ephemeral shell session inside <span className="font-medium text-slate-700">{containerName}</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={shell} onChange={(event) => setShell(event.target.value as TerminalShell)} className="w-auto min-w-[7rem]">
              <option value="sh">sh</option>
              <option value="bash">bash</option>
            </Select>
            <Button disabled={!isConnectable || isActiveConnection} onClick={connectTerminal}>
              {state.status === "connecting" ? "Connecting..." : "Connect"}
            </Button>
            <Button variant="secondary" disabled={!isConnectable || isActiveConnection} onClick={() => void runDiagnostics()}>
              Run diagnostics
            </Button>
            <Button variant="ghost" disabled={!isActiveConnection} onClick={disconnectTerminal}>
              Disconnect
            </Button>
            <Button variant="ghost" onClick={clearTerminal}>
              Clear
            </Button>
          </div>
        </div>

        {availabilityMessage ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{availabilityMessage}</p> : null}
        {state.error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{state.error}</p> : null}
        {state.status === "exited" ? (
          <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
            Session exited{state.exitCode == null ? "." : ` with code ${state.exitCode}.`} Reconnect to start a new shell.
          </p>
        ) : null}

        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-3 shadow-inner">
          <div ref={terminalHostRef} className="min-h-[26rem] w-full" />
        </div>
      </Panel>

      <Panel className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Verbose diagnostics</p>
            <p className="text-xs text-slate-500">Temporary handshake trace for websocket and preflight debugging.</p>
          </div>
          <Button variant="ghost" onClick={() => setDiagnostics([])}>
            Clear diagnostics
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-100">
          {diagnostics.length === 0 ? (
            <p className="text-slate-400">No diagnostics captured yet. Use Run diagnostics to trace the websocket handshake.</p>
          ) : (
            <div className="space-y-3">
              {diagnostics.map((entry, index) => (
                <div key={`${entry.timestamp}-${entry.event}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {entry.timestamp} · {entry.source} · {entry.event}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-slate-100">{entry.detail}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Fallback helper commands</p>
          <p className="text-xs text-slate-500">Keep these available for debugging outside the browser terminal.</p>
        </div>
        {terminalCommands.map((command) => (
          <div key={command.command} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-950">{command.label}</p>
                <code className="text-sm text-slate-600">{command.command}</code>
              </div>
              <CopyButton text={command.command} />
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
};
