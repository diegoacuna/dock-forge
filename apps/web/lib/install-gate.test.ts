import { describe, expect, it } from "vitest";
import { resolveInstallRedirect } from "./install-gate";

describe("resolveInstallRedirect", () => {
  it("redirects app routes to install before completion", () => {
    expect(resolveInstallRedirect({ pathname: "/groups", installCompleted: false })).toBe("/install");
  });

  it("does not redirect the install page before completion", () => {
    expect(resolveInstallRedirect({ pathname: "/install", installCompleted: false })).toBeNull();
  });

  it("redirects install back to dashboard after completion", () => {
    expect(resolveInstallRedirect({ pathname: "/install", installCompleted: true })).toBe("/");
  });
});
