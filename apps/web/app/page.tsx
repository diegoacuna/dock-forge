"use client";

import Link from "next/link";
import type { DashboardData } from "@dockforge/shared";
import { useApiQuery } from "../lib/api";
import { formatTimestamp } from "../lib/utils";
import { PageHeader, Panel, StatCard } from "../components/ui";
import { StateBadge } from "../components/status";

export default function DashboardPage() {
  const { data } = useApiQuery<DashboardData>(["dashboard"], "/dashboard", 10_000);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Craft your local Docker empire with group orchestration, dependency-aware startup, and live inspection."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Containers" value={data?.totalContainers ?? 0} hint={`${data?.runningContainers ?? 0} running`} />
        <StatCard label="Stopped" value={data?.stoppedContainers ?? 0} hint={`${data?.unhealthyContainers ?? 0} unhealthy`} />
        <StatCard label="Groups" value={data?.totalGroups ?? 0} hint={`${data?.orphanContainers ?? 0} orphan containers`} />
        <StatCard label="Recent Runs" value={data?.recentGroupRuns.length ?? 0} hint="Latest orchestration history" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <h2 className="text-lg font-semibold text-slate-950">Recent orchestration activity</h2>
          <div className="mt-4 space-y-3">
            {data?.recentGroupRuns.map((run) => (
              <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{run.action.replaceAll("_", " ")}</p>
                    <p className="text-sm text-slate-500">{formatTimestamp(run.startedAt)}</p>
                  </div>
                  <StateBadge state={run.status.toLowerCase()} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold text-slate-950">Groups</h2>
          <div className="mt-4 space-y-3">
            {data?.groups.map((group) => (
              <Link key={group.id} href={`/groups/${group.id}`} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-orange-300">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{group.name}</p>
                    <p className="text-sm text-slate-500">{group.memberCount} members</p>
                  </div>
                  <StateBadge state={group.lastRunStatus?.toLowerCase()} />
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

