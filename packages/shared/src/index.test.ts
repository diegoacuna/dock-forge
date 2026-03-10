import { describe, expect, it } from "vitest";
import {
  completeInstallSchema,
  containersPageDataSchema,
  groupActionLaunchSchema,
  containersTourUpdateSchema,
  groupRunStepSchema,
  groupsPageDataSchema,
  groupsTourUpdateSchema,
} from "./index";

describe("containers page schemas", () => {
  it("accepts install payloads for socket mode", () => {
    expect(
      completeInstallSchema.parse({
        dockerConnectionMode: "socket",
        dockerSocketPath: "/var/run/docker.sock",
        dockerHost: null,
      }),
    ).toEqual({
      dockerConnectionMode: "socket",
      dockerSocketPath: "/var/run/docker.sock",
      dockerHost: null,
    });
  });

  it("accepts install payloads for host mode", () => {
    expect(
      completeInstallSchema.parse({
        dockerConnectionMode: "host",
        dockerSocketPath: null,
        dockerHost: "tcp://127.0.0.1:2375",
      }),
    ).toEqual({
      dockerConnectionMode: "host",
      dockerSocketPath: null,
      dockerHost: "tcp://127.0.0.1:2375",
    });
  });

  it("rejects install payloads when the selected mode is missing its required value", () => {
    expect(() =>
      completeInstallSchema.parse({
        dockerConnectionMode: "host",
        dockerSocketPath: null,
        dockerHost: "",
      }),
    ).toThrow("Docker host is required");
  });

  it("accepts the containers page payload shape", () => {
    expect(
      containersPageDataSchema.parse({
        containers: [],
        runtime: {
          status: "connected",
          reason: "unknown",
          message: null,
        },
        onboarding: {
          containersTourSeen: false,
          persistenceAvailable: true,
        },
      }),
    ).toEqual({
      containers: [],
      runtime: {
        status: "connected",
        reason: "unknown",
        message: null,
      },
      onboarding: {
        containersTourSeen: false,
        persistenceAvailable: true,
      },
    });
  });

  it("accepts containers tour updates", () => {
    expect(containersTourUpdateSchema.parse({ containersTourSeen: true })).toEqual({
      containersTourSeen: true,
    });
  });

  it("accepts the groups page payload shape", () => {
    expect(
      groupsPageDataSchema.parse({
        groups: [],
        onboarding: {
          groupsTourSeen: false,
          persistenceAvailable: true,
        },
      }),
    ).toEqual({
      groups: [],
      onboarding: {
        groupsTourSeen: false,
        persistenceAvailable: true,
      },
    });
  });

  it("accepts groups tour updates", () => {
    expect(groupsTourUpdateSchema.parse({ groupsTourSeen: true })).toEqual({
      groupsTourSeen: true,
    });
  });

  it("accepts structured group run step metadata", () => {
    expect(
      groupRunStepSchema.parse({
        id: "step-1",
        groupRunId: "run-1",
        groupContainerId: "group-container-1",
        containerKey: "api",
        containerNameSnapshot: "api-1",
        action: "START",
        status: "SKIPPED",
        message: "Container api is already running",
        startedAt: "2026-03-10T12:00:00.000Z",
        completedAt: "2026-03-10T12:00:01.000Z",
        metadataJson: "{\"noopReason\":\"already_running\"}",
        metadata: {
          noopReason: "already_running",
          runtimeStateBefore: "running",
          runtimeStateAfter: "running",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        metadata: {
          noopReason: "already_running",
          runtimeStateBefore: "running",
          runtimeStateAfter: "running",
        },
      }),
    );
  });

  it("accepts the group action launch payload shape", () => {
    expect(
      groupActionLaunchSchema.parse({
        runId: "run-1",
        run: {
          id: "run-1",
          groupId: "group-1",
          action: "START",
          status: "PENDING",
          startedAt: "2026-03-10T12:00:00.000Z",
          completedAt: null,
          summaryJson: null,
          steps: [],
        },
      }),
    ).toEqual(
      expect.objectContaining({
        runId: "run-1",
      }),
    );
  });
});
