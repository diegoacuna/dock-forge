import { describe, expect, it } from "vitest";
import {
  DASHBOARD_ONBOARDING_DISMISSED_KEY,
  dashboardOnboardingSteps,
  getCreateGroupHref,
  getInitialGroupDetailTab,
  getPostCreateGroupHref,
  shouldShowContainersOnboarding,
  shouldShowDashboardOnboarding,
  shouldShowGroupsOnboarding,
} from "./onboarding";

describe("onboarding helpers", () => {
  it("keeps a stable dismissal storage key", () => {
    expect(DASHBOARD_ONBOARDING_DISMISSED_KEY).toBe("dockforge.dashboardOnboardingDismissed");
  });

  it("shows dashboard onboarding only when there are no groups and it is not dismissed", () => {
    expect(shouldShowDashboardOnboarding(0, false)).toBe(true);
    expect(shouldShowDashboardOnboarding(0, true)).toBe(false);
    expect(shouldShowDashboardOnboarding(2, false)).toBe(false);
  });

  it("builds the create-group href with onboarding context only when needed", () => {
    expect(getCreateGroupHref(true)).toBe("/groups/new?from=onboarding");
    expect(getCreateGroupHref(false)).toBe("/groups/new");
  });

  it("builds the post-create redirect to continue onboarding when requested", () => {
    expect(getPostCreateGroupHref("group-123", true)).toBe("/groups/group-123?onboarding=attach");
    expect(getPostCreateGroupHref("group-123", false)).toBe("/groups/group-123");
  });

  it("opens the containers tab when attach onboarding is active", () => {
    expect(getInitialGroupDetailTab("attach")).toBe("Containers");
    expect(getInitialGroupDetailTab(null)).toBe("Overview");
    expect(getInitialGroupDetailTab("other")).toBe("Overview");
  });

  it("defines a four-step onboarding tour ending in the create-group action", () => {
    expect(dashboardOnboardingSteps).toHaveLength(4);
    expect(dashboardOnboardingSteps.at(-1)?.id).toBe("launch");
  });

  it("shows containers onboarding only when runtime is connected, containers exist, and it has not been seen", () => {
    expect(shouldShowContainersOnboarding({ runtimeStatus: "connected", totalContainers: 3, seen: false })).toBe(true);
    expect(shouldShowContainersOnboarding({ runtimeStatus: "unavailable", totalContainers: 3, seen: false })).toBe(false);
    expect(shouldShowContainersOnboarding({ runtimeStatus: "connected", totalContainers: 0, seen: false })).toBe(false);
    expect(shouldShowContainersOnboarding({ runtimeStatus: "connected", totalContainers: 3, seen: true })).toBe(false);
  });

  it("shows groups onboarding only when groups exist and it has not been seen", () => {
    expect(shouldShowGroupsOnboarding({ totalGroups: 2, seen: false })).toBe(true);
    expect(shouldShowGroupsOnboarding({ totalGroups: 0, seen: false })).toBe(false);
    expect(shouldShowGroupsOnboarding({ totalGroups: 2, seen: true })).toBe(false);
  });
});
