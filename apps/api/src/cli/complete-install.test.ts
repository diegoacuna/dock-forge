import { describe, expect, it } from "vitest";
import { parseCompleteInstallArgs } from "./complete-install.js";

describe("complete-install cli", () => {
  it("parses socket mode with an explicit socket path", () => {
    expect(
      parseCompleteInstallArgs(["--docker-connection-mode", "socket", "--docker-socket-path", "/custom/docker.sock"]),
    ).toEqual({
      dockerConnectionMode: "socket",
      dockerSocketPath: "/custom/docker.sock",
      dockerHost: null,
    });
  });

  it("defaults socket mode to /var/run/docker.sock", () => {
    expect(parseCompleteInstallArgs(["--docker-connection-mode", "socket"])).toEqual({
      dockerConnectionMode: "socket",
      dockerSocketPath: "/var/run/docker.sock",
      dockerHost: null,
    });
  });

  it("parses host mode", () => {
    expect(
      parseCompleteInstallArgs(["--docker-connection-mode", "host", "--docker-host", "tcp://127.0.0.1:2375"]),
    ).toEqual({
      dockerConnectionMode: "host",
      dockerSocketPath: null,
      dockerHost: "tcp://127.0.0.1:2375",
    });
  });

  it("rejects host mode without a host", () => {
    expect(() => parseCompleteInstallArgs(["--docker-connection-mode", "host"])).toThrow("Docker host is required");
  });

  it("rejects unknown arguments", () => {
    expect(() => parseCompleteInstallArgs(["--wat"])).toThrow("Unknown argument");
  });

  it("ignores the standalone pnpm argument delimiter", () => {
    expect(parseCompleteInstallArgs(["--", "--docker-connection-mode", "socket"])).toEqual({
      dockerConnectionMode: "socket",
      dockerSocketPath: "/var/run/docker.sock",
      dockerHost: null,
    });
  });
});
