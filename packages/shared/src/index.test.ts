import { describe, expect, it } from "vitest";
import {
  completeInstallSchema,
  containersPageDataSchema,
  containersTourUpdateSchema,
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
});
