import { describe, expect, it } from "vitest";
import { buildTerminalWindowPath, resolveTerminalShell, shouldAutoConnectTerminal } from "./container-terminal-route";

describe("container terminal route helpers", () => {
  it("keeps a valid requested shell", () => {
    expect(resolveTerminalShell("sh")).toBe("sh");
    expect(resolveTerminalShell("bash")).toBe("bash");
  });

  it("falls back to sh when the requested shell is invalid or missing", () => {
    expect(resolveTerminalShell("zsh")).toBe("sh");
    expect(resolveTerminalShell(null)).toBe("sh");
    expect(resolveTerminalShell(undefined)).toBe("sh");
  });

  it("detects whether auto-connect should run", () => {
    expect(shouldAutoConnectTerminal("1")).toBe(true);
    expect(shouldAutoConnectTerminal("0")).toBe(false);
    expect(shouldAutoConnectTerminal(null)).toBe(false);
  });

  it("builds the focused terminal window path", () => {
    expect(
      buildTerminalWindowPath({
        containerIdOrName: "postgres",
        shell: "bash",
      }),
    ).toBe("/terminal/containers/postgres?shell=bash&autoconnect=1");
  });
});
