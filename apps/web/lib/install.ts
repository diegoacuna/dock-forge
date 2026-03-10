import type { InstallConfig, InstallStatus } from "@dockforge/shared";

const DEFAULT_API_BASE = "http://localhost:4000/api";

export const getServerApiBaseUrl = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;

export const getDefaultInstallConfig = (): InstallConfig => ({
  dockerConnectionMode: "socket",
  dockerSocketPath: "/var/run/docker.sock",
  dockerHost: null,
});

export const getInstallStatusFallback = (): InstallStatus => ({
  installCompleted: false,
  persistenceAvailable: true,
  config: getDefaultInstallConfig(),
});

export const fetchInstallStatusServer = async (): Promise<InstallStatus> => {
  const response = await fetch(`${getServerApiBaseUrl()}/install/status`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load install status: ${response.status}`);
  }

  return (await response.json()) as InstallStatus;
};
