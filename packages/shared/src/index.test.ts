import { describe, expect, it } from "vitest";
import { containersPageDataSchema, containersTourUpdateSchema, groupsPageDataSchema, groupsTourUpdateSchema } from "./index";

describe("containers page schemas", () => {
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
