import { terminalShellSchema, type TerminalShell } from "@dockforge/shared";

export const resolveTerminalShell = (requested: string | null | undefined): TerminalShell => {
  const parsed = terminalShellSchema.safeParse(requested);
  return parsed.success ? parsed.data : "sh";
};

export const shouldAutoConnectTerminal = (requested: string | null | undefined) => requested === "1";

export const buildTerminalWindowPath = ({
  containerIdOrName,
  shell,
}: {
  containerIdOrName: string;
  shell: TerminalShell;
}) => {
  const params = new URLSearchParams({
    shell,
    autoconnect: "1",
  });

  return `/terminal/containers/${encodeURIComponent(containerIdOrName)}?${params.toString()}`;
};
