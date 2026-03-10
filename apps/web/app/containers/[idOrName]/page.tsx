"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ContainerDetail } from "@dockforge/shared";
import { useApiQuery } from "@/lib/api";
import { formatTimestamp } from "@/lib/utils";
import { CopyButton, PageHeader, Panel } from "@/components/ui";
import { ContainerTerminalPanel } from "@/components/container-terminal-panel";

const tabs = ["Overview", "Environment", "Mounts / Volumes", "Networks", "Compose metadata", "Raw inspect", "Terminal"] as const;

export default function ContainerDetailPage({ params }: { params: Promise<{ idOrName: string }> }) {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading container...</div>}>
      <ContainerDetailPageContent params={params} />
    </Suspense>
  );
}

function ContainerDetailPageContent({ params }: { params: Promise<{ idOrName: string }> }) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const { data } = useApiQuery<ContainerDetail>(["container", resolvedParams.idOrName], `/containers/${resolvedParams.idOrName}`, 8_000);
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    if (requestedTab && tabs.includes(requestedTab as (typeof tabs)[number])) {
      setTab(requestedTab as (typeof tabs)[number]);
    }
  }, [requestedTab]);

  const overview = data?.overview;

  return (
    <div className="space-y-6">
      <PageHeader title={overview?.name ?? resolvedParams.idOrName} description="Raw Docker inspect plus focused operational views." />

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-2xl px-4 py-2 text-sm ${tab === item ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" && overview ? (
        <Panel className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p><strong>Docker ID:</strong> {overview.id}</p>
            <p><strong>Image:</strong> {overview.image}</p>
            <p><strong>State:</strong> {overview.state}</p>
            <p><strong>Started:</strong> {formatTimestamp(overview.startedAt)}</p>
            <p><strong>Restart policy:</strong> {overview.restartPolicy ?? "—"}</p>
            <p><strong>Command:</strong> {overview.command ?? "—"}</p>
            <p><strong>Entrypoint:</strong> {overview.entrypoint.join(" ") || "—"}</p>
          </div>
          <div className="space-y-2">
            <p><strong>Ports:</strong> {overview.ports.map((port) => port.label).join(", ") || "—"}</p>
            <p><strong>Health:</strong> {overview.health}</p>
            <div>
              <strong>Labels</strong>
              <pre className="mt-2 rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.labels, null, 2)}</pre>
            </div>
          </div>
        </Panel>
      ) : null}

      {tab === "Environment" && overview ? (
        <Panel>
          <div className="mb-3 flex justify-end"><CopyButton text={overview.environment.join("\n")} /></div>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{overview.environment.join("\n")}</pre>
        </Panel>
      ) : null}

      {tab === "Mounts / Volumes" && overview ? (
        <Panel>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.mounts, null, 2)}</pre>
        </Panel>
      ) : null}

      {tab === "Networks" && overview ? (
        <Panel>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.networks, null, 2)}</pre>
        </Panel>
      ) : null}

      {tab === "Compose metadata" && overview ? (
        <Panel>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.compose, null, 2)}</pre>
        </Panel>
      ) : null}

      {tab === "Raw inspect" && overview ? (
        <Panel>
          <div className="mb-3 flex justify-end"><CopyButton text={JSON.stringify(overview.inspect, null, 2)} /></div>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.inspect, null, 2)}</pre>
        </Panel>
      ) : null}

      {tab === "Terminal" && data && overview ? (
        <ContainerTerminalPanel
          containerIdOrName={resolvedParams.idOrName}
          containerName={overview.name}
          containerState={overview.state}
          terminalCommands={data.terminalCommands}
        />
      ) : null}
    </div>
  );
}
