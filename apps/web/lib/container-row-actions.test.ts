import { describe, expect, it } from "vitest";
import { getContainerDetailActions, getContainerOverflowMenuItems, getPrimaryContainerAction } from "./container-row-actions";

describe("container row actions", () => {
  it("shows Start as the primary action for stopped containers", () => {
    expect(getPrimaryContainerAction({ state: "exited", isRowPending: false, pendingAction: null })).toEqual({
      action: "start",
      label: "Start",
      disabled: false,
    });
  });

  it("shows Stop as the primary action for running containers", () => {
    expect(getPrimaryContainerAction({ state: "running", isRowPending: false, pendingAction: null })).toEqual({
      action: "stop",
      label: "Stop",
      disabled: false,
    });
  });

  it("keeps the primary slot disabled while a container is restarting", () => {
    expect(getPrimaryContainerAction({ state: "restarting", isRowPending: false, pendingAction: null })).toEqual({
      action: "stop",
      label: "Stop",
      disabled: true,
    });
  });

  it("preserves pending labels for start and stop", () => {
    expect(getPrimaryContainerAction({ state: "created", isRowPending: true, pendingAction: "start" }).label).toBe("Starting...");
    expect(getPrimaryContainerAction({ state: "running", isRowPending: true, pendingAction: "stop" }).label).toBe("Stopping...");
  });

  it("shows only Start in the detail view for stopped containers", () => {
    expect(getContainerDetailActions({ state: "exited", isActionPending: false, pendingAction: null })).toEqual([
      {
        action: "start",
        label: "Start",
        disabled: false,
        variant: "success",
      },
    ]);
  });

  it("shows Stop and Restart in the detail view for running containers", () => {
    expect(getContainerDetailActions({ state: "running", isActionPending: false, pendingAction: null })).toEqual([
      {
        action: "stop",
        label: "Stop",
        disabled: false,
        variant: "danger",
      },
      {
        action: "restart",
        label: "Restart",
        disabled: false,
        variant: "ghost",
      },
    ]);
  });

  it("shows a disabled restarting state in the detail view while the container is restarting", () => {
    expect(getContainerDetailActions({ state: "restarting", isActionPending: false, pendingAction: null })).toEqual([
      {
        action: "restart",
        label: "Restarting...",
        disabled: true,
        variant: "warning",
      },
    ]);
  });

  it("exposes Restart and Open Terminal in the overflow menu", () => {
    expect(getContainerOverflowMenuItems("api")).toEqual([
      { key: "restart", label: "Restart" },
      { key: "terminal", label: "Open Terminal", href: "/containers/api?tab=Terminal" },
    ]);
  });
});
