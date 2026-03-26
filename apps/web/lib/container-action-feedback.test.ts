import { describe, expect, it } from "vitest";
import {
  CONTAINER_ACTION_FEEDBACK_TIMEOUT_MS,
  createContainerActionErrorFeedback,
  createPendingContainerActionFeedback,
  didContainerActionReachExpectedState,
  getContainerActionFeedbackLabel,
  getContainerActionFeedbackTone,
  isContainerActionBusy,
  markContainerActionWaitingForState,
  resolveContainerActionFeedback,
} from "./container-action-feedback";

describe("container action feedback", () => {
  it("creates pending feedback with the action message", () => {
    expect(createPendingContainerActionFeedback("start", { state: "exited", startedAt: null }, 1)).toEqual({
      action: "start",
      phase: "pending",
      message: "Starting container...",
      startedAtMs: 1,
      baseline: {
        state: "exited",
        startedAt: null,
      },
    });
  });

  it("marks a pending action as waiting for docker state", () => {
    expect(
      markContainerActionWaitingForState(createPendingContainerActionFeedback("stop", { state: "running", startedAt: "2026-03-25T18:00:00.000Z" }, 1)),
    ).toMatchObject({
      action: "stop",
      phase: "waiting_for_state",
      message: "Stopping container...",
    });
  });

  it("recognizes terminal success states for start and stop", () => {
    expect(
      didContainerActionReachExpectedState("start", { state: "running", startedAt: "2026-03-25T18:01:00.000Z" }, { state: "exited", startedAt: null }),
    ).toBe(true);
    expect(
      didContainerActionReachExpectedState("stop", { state: "exited", startedAt: "2026-03-25T18:01:00.000Z" }, { state: "running", startedAt: "2026-03-25T18:00:00.000Z" }),
    ).toBe(true);
  });

  it("requires a changed startedAt timestamp to confirm restart success", () => {
    expect(
      didContainerActionReachExpectedState(
        "restart",
        { state: "running", startedAt: "2026-03-25T18:00:00.000Z" },
        { state: "running", startedAt: "2026-03-25T18:00:00.000Z" },
      ),
    ).toBe(false);
    expect(
      didContainerActionReachExpectedState(
        "restart",
        { state: "running", startedAt: "2026-03-25T18:01:00.000Z" },
        { state: "running", startedAt: "2026-03-25T18:00:00.000Z" },
      ),
    ).toBe(true);
  });

  it("resolves waiting feedback to success once the expected state is observed", () => {
    const waiting = markContainerActionWaitingForState(
      createPendingContainerActionFeedback("start", { state: "exited", startedAt: null }, 1),
    );

    expect(resolveContainerActionFeedback(waiting, { state: "running", startedAt: "2026-03-25T18:01:00.000Z" }, 2)).toMatchObject({
      phase: "success",
      message: "Container is running.",
    });
  });

  it("resolves waiting feedback to timeout error after the configured timeout", () => {
    const waiting = markContainerActionWaitingForState(
      createPendingContainerActionFeedback("stop", { state: "running", startedAt: "2026-03-25T18:00:00.000Z" }, 1),
    );

    expect(resolveContainerActionFeedback(waiting, { state: "running", startedAt: "2026-03-25T18:00:00.000Z" }, CONTAINER_ACTION_FEEDBACK_TIMEOUT_MS + 1)).toMatchObject({
      phase: "error",
      message: "Stop was requested, but Docker did not report the expected state yet.",
    });
  });

  it("marks pending and waiting phases as busy, but not success or error", () => {
    const pending = createPendingContainerActionFeedback("restart", { state: "running", startedAt: "2026-03-25T18:00:00.000Z" }, 1);
    const waiting = markContainerActionWaitingForState(pending);
    const success = resolveContainerActionFeedback(waiting, { state: "running", startedAt: "2026-03-25T18:01:00.000Z" }, 2);
    const error = createContainerActionErrorFeedback("start", "Docker rejected the action.");

    expect(isContainerActionBusy(pending)).toBe(true);
    expect(isContainerActionBusy(waiting)).toBe(true);
    expect(isContainerActionBusy(success)).toBe(false);
    expect(isContainerActionBusy(error)).toBe(false);
  });

  it("derives labels and tones for rendered status feedback", () => {
    const waiting = markContainerActionWaitingForState(
      createPendingContainerActionFeedback("restart", { state: "running", startedAt: "2026-03-25T18:00:00.000Z" }, 1),
    );
    const success = resolveContainerActionFeedback(waiting, { state: "running", startedAt: "2026-03-25T18:01:00.000Z" }, 2);
    const error = createContainerActionErrorFeedback("stop");

    expect(getContainerActionFeedbackLabel(waiting)).toBe("Restarting");
    expect(getContainerActionFeedbackLabel(success)).toBe("Success");
    expect(getContainerActionFeedbackLabel(error)).toBe("Action issue");
    expect(getContainerActionFeedbackTone(waiting)).toBe("accent");
    expect(getContainerActionFeedbackTone(success)).toBe("success");
    expect(getContainerActionFeedbackTone(error)).toBe("danger");
  });
});
