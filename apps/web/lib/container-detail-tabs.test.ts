import { describe, expect, it } from "vitest";
import { CONTAINER_DETAIL_TABS, resolveContainerDetailTab } from "./container-detail-tabs";

describe("container detail tabs", () => {
  it("keeps the container detail tabs in the intended order", () => {
    expect(CONTAINER_DETAIL_TABS).toEqual([
      "Overview",
      "Environment",
      "Mounts / Volumes",
      "Networks",
      "Compose metadata",
      "Raw inspect",
      "Logs",
      "Terminal",
    ]);
  });

  it("uses a valid requested tab from the url", () => {
    expect(resolveContainerDetailTab("Logs")).toBe("Logs");
    expect(resolveContainerDetailTab("Terminal")).toBe("Terminal");
    expect(resolveContainerDetailTab("Raw inspect")).toBe("Raw inspect");
  });

  it("falls back to overview when the requested tab is missing or invalid", () => {
    expect(resolveContainerDetailTab(null)).toBe("Overview");
    expect(resolveContainerDetailTab("Bad Tab")).toBe("Overview");
  });
});
