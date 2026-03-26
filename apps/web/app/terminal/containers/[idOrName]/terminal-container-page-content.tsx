"use client";

import type { ContainerDetail } from "@dockforge/shared";
import { StateBadge } from "@/components/status";
import { ContainerTerminalPanel } from "@/components/container-terminal-panel";
import { PageHeader } from "@/components/ui";
import { useApiQuery } from "@/lib/api";
import { resolveTerminalShell, shouldAutoConnectTerminal } from "@/lib/container-terminal-route";

export function TerminalContainerPageContent({
  resolvedParams,
  searchParams,
}: {
  resolvedParams: { idOrName: string };
  searchParams: { shell?: string; autoconnect?: string };
}) {
  const { data } = useApiQuery<ContainerDetail>(["container", resolvedParams.idOrName], `/containers/${resolvedParams.idOrName}`, 8_000);
  const overview = data?.overview;
  const shell = resolveTerminalShell(searchParams.shell);
  const autoConnectOnReady = shouldAutoConnectTerminal(searchParams.autoconnect);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <PageHeader
        title={overview?.name ?? resolvedParams.idOrName}
        titlePrefix={overview ? <StateBadge state={overview.state} health={overview.health} /> : undefined}
        description="Focused terminal window for an interactive shell session inside this container."
      />

      {overview && data ? (
        <ContainerTerminalPanel
          containerIdOrName={resolvedParams.idOrName}
          containerName={overview.name}
          containerState={overview.state}
          terminalCommands={data.terminalCommands}
          mode="window"
          initialShell={shell}
          autoConnectOnReady={autoConnectOnReady}
        />
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading terminal...</div>
      )}
    </div>
  );
}
