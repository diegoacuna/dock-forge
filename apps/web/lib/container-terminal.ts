import type { ContainerState, TerminalServerMessage } from "@dockforge/shared";

export type TerminalConnectionState = {
  status: "disconnected" | "connecting" | "connected" | "exited" | "error";
  error: string | null;
  exitCode: number | null;
};

export type TerminalDiagnosticEntry = {
  timestamp: string;
  source: "ui" | "ws" | "api-preflight";
  event: string;
  detail: string;
};

export type TerminalConnectionAction =
  | { type: "connect" }
  | { type: "ready" }
  | { type: "exit"; exitCode: number | null }
  | { type: "error"; message: string }
  | { type: "disconnect" };

export const initialTerminalConnectionState: TerminalConnectionState = {
  status: "disconnected",
  error: null,
  exitCode: null,
};

export const reduceTerminalConnectionState = (
  state: TerminalConnectionState,
  action: TerminalConnectionAction,
): TerminalConnectionState => {
  switch (action.type) {
    case "connect":
      return { status: "connecting", error: null, exitCode: null };
    case "ready":
      return { status: "connected", error: null, exitCode: null };
    case "exit":
      return { status: "exited", error: null, exitCode: action.exitCode };
    case "error":
      return { status: "error", error: action.message, exitCode: null };
    case "disconnect":
      return { status: "disconnected", error: null, exitCode: null };
    default:
      return state;
  }
};

export const isTerminalConnectable = (containerState: ContainerState) => containerState === "running";

export const getTerminalAvailabilityMessage = (containerState: ContainerState) =>
  isTerminalConnectable(containerState)
    ? null
    : `Terminal access is only available while the container is running. Current state: ${containerState}.`;

export const toTerminalConnectionAction = (message: TerminalServerMessage): TerminalConnectionAction | null => {
  switch (message.type) {
    case "ready":
      return { type: "ready" };
    case "exit":
      return { type: "exit", exitCode: message.exitCode };
    case "error":
      return { type: "error", message: message.message };
    default:
      return null;
  }
};

export const appendTerminalDiagnostic = (
  entries: TerminalDiagnosticEntry[],
  entry: Omit<TerminalDiagnosticEntry, "timestamp">,
  now: () => string = () => new Date().toISOString(),
) => [
  ...entries,
  {
    timestamp: now(),
    ...entry,
  },
];

export const formatTerminalDiagnosticDetail = (detail: unknown) => {
  if (typeof detail === "string") {
    return detail;
  }

  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
};
