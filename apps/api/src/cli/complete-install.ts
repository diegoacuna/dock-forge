import { completeInstallSchema, type InstallConfig } from "@dockforge/shared";
import { fileURLToPath } from "node:url";
import { completeInstall } from "../services.js";

const DEFAULT_DOCKER_SOCKET_PATH = "/var/run/docker.sock";

const usage = `Usage:
  pnpm install:complete -- --docker-connection-mode <socket|host> [--docker-socket-path <path>] [--docker-host <url>]

Examples:
  pnpm install:complete -- --docker-connection-mode socket --docker-socket-path /var/run/docker.sock
  pnpm install:complete -- --docker-connection-mode host --docker-host tcp://127.0.0.1:2375
`;

type ParsedCliArgs = {
  dockerConnectionMode?: "socket" | "host";
  dockerSocketPath?: string;
  dockerHost?: string;
  help?: boolean;
};

const requireValue = (flag: string, value: string | undefined) => {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.\n\n${usage}`);
  }

  return value;
};

export const parseCompleteInstallArgs = (argv: string[]): InstallConfig => {
  const parsed: ParsedCliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      break;
    }

    if (arg === "--docker-connection-mode") {
      parsed.dockerConnectionMode = requireValue(arg, argv[index + 1]) as "socket" | "host";
      index += 1;
      continue;
    }

    if (arg === "--docker-socket-path") {
      parsed.dockerSocketPath = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--docker-host") {
      parsed.dockerHost = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage}`);
  }

  if (parsed.help) {
    throw new Error(usage);
  }

  return completeInstallSchema.parse({
    dockerConnectionMode: parsed.dockerConnectionMode,
    dockerSocketPath: parsed.dockerConnectionMode === "socket" ? parsed.dockerSocketPath ?? DEFAULT_DOCKER_SOCKET_PATH : null,
    dockerHost: parsed.dockerConnectionMode === "host" ? parsed.dockerHost ?? null : null,
  });
};

export const runCompleteInstallCli = async (argv: string[]) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(usage);
    return;
  }

  const installConfig = parseCompleteInstallArgs(argv);
  const status = await completeInstall(installConfig);

  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
};

const isDirectRun = process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runCompleteInstallCli(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : "Unable to complete install.";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
