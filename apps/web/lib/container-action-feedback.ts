import type { ContainerOverview } from "@dockforge/shared";
import type { PendingContainerAction } from "./container-row-actions";

export const CONTAINER_ACTION_FEEDBACK_TIMEOUT_MS = 15_000;

const STOPPED_STATES = new Set<ContainerOverview["state"]>(["created", "exited", "dead"]);

export type ContainerActionFeedbackPhase = "idle" | "pending" | "waiting_for_state" | "success" | "error";

type ContainerActionBaseline = Pick<ContainerOverview, "state" | "startedAt">;

type ActiveContainerActionFeedback = {
  action: PendingContainerAction;
  phase: Exclude<ContainerActionFeedbackPhase, "idle">;
  message: string;
  startedAtMs: number;
  baseline: ContainerActionBaseline;
};

export type ContainerActionFeedback =
  | {
      phase: "idle";
    }
  | ActiveContainerActionFeedback;

const getActionVerb = (action: PendingContainerAction) => {
  switch (action) {
    case "start":
      return "Start";
    case "stop":
      return "Stop";
    case "restart":
      return "Restart";
  }
};

const getActionGerund = (action: PendingContainerAction) => {
  switch (action) {
    case "start":
      return "Starting";
    case "stop":
      return "Stopping";
    case "restart":
      return "Restarting";
  }
};

const getActionSuccessMessage = (action: PendingContainerAction) => {
  switch (action) {
    case "start":
    case "restart":
      return "Container is running.";
    case "stop":
      return "Container is stopped.";
  }
};

export const isContainerActionBusy = (feedback: ContainerActionFeedback) =>
  feedback.phase === "pending" || feedback.phase === "waiting_for_state";

export const getContainerActionFeedbackTone = (feedback: ContainerActionFeedback) => {
  switch (feedback.phase) {
    case "pending":
    case "waiting_for_state":
      return "accent" as const;
    case "success":
      return "success" as const;
    case "error":
      return "danger" as const;
    case "idle":
      return "neutral" as const;
  }
};

export const getContainerActionFeedbackLabel = (feedback: ContainerActionFeedback) => {
  if (feedback.phase === "idle") {
    return null;
  }

  if (feedback.phase === "success") {
    return "Success";
  }

  if (feedback.phase === "error") {
    return "Action issue";
  }

  return getActionGerund(feedback.action);
};

export const createPendingContainerActionFeedback = (
  action: PendingContainerAction,
  overview: Pick<ContainerOverview, "state" | "startedAt">,
  nowMs = Date.now(),
): ContainerActionFeedback => ({
  action,
  phase: "pending",
  message: `${getActionGerund(action)} container...`,
  startedAtMs: nowMs,
  baseline: {
    state: overview.state,
    startedAt: overview.startedAt,
  },
});

export const createContainerActionErrorFeedback = (
  action: PendingContainerAction,
  message?: string,
  nowMs = Date.now(),
): ContainerActionFeedback => ({
  action,
  phase: "error",
  message: message?.trim() || `${getActionVerb(action)} failed.`,
  startedAtMs: nowMs,
  baseline: {
    state: "unknown",
    startedAt: null,
  },
});

export const markContainerActionWaitingForState = (feedback: ContainerActionFeedback): ContainerActionFeedback => {
  if (feedback.phase !== "pending") {
    return feedback;
  }

  return {
    ...feedback,
    phase: "waiting_for_state",
    message: `${getActionGerund(feedback.action)} container...`,
  };
};

export const didContainerActionReachExpectedState = (
  action: PendingContainerAction,
  overview: Pick<ContainerOverview, "state" | "startedAt">,
  baseline: Pick<ContainerOverview, "state" | "startedAt">,
) => {
  if (action === "stop") {
    return STOPPED_STATES.has(overview.state);
  }

  if (action === "restart") {
    return overview.state === "running" && overview.startedAt !== baseline.startedAt;
  }

  return overview.state === "running";
};

export const resolveContainerActionFeedback = (
  feedback: ContainerActionFeedback,
  overview: Pick<ContainerOverview, "state" | "startedAt">,
  nowMs = Date.now(),
  timeoutMs = CONTAINER_ACTION_FEEDBACK_TIMEOUT_MS,
): ContainerActionFeedback => {
  if (feedback.phase !== "waiting_for_state") {
    return feedback;
  }

  if (didContainerActionReachExpectedState(feedback.action, overview, feedback.baseline)) {
    return {
      ...feedback,
      phase: "success",
      message: getActionSuccessMessage(feedback.action),
    };
  }

  if (nowMs - feedback.startedAtMs >= timeoutMs) {
    return {
      ...feedback,
      phase: "error",
      message: `${getActionVerb(feedback.action)} was requested, but Docker did not report the expected state yet.`,
    };
  }

  return feedback;
};
