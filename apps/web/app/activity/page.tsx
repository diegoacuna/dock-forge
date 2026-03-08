"use client";

import type { GroupRun } from "@dockforge/shared";
import { useApiQuery } from "../../lib/api";
import { formatTimestamp } from "../../lib/utils";
import { StateBadge } from "../../components/status";
import { PageHeader, Panel } from "../../components/ui";

type ActivityRun = GroupRun & { groupName: string };

export default function ActivityPage() {
  const { data } = useApiQuery<ActivityRun[]>(["activity"], "/activity", 8_000);

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Recent orchestration runs across all groups, including step-by-step execution history." />
      <Panel className="space-y-4">
        {data?.map((run) => (
          <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-950">{run.groupName}</p>
                <p className="text-sm text-slate-500">{run.action.replaceAll("_", " ")} · {formatTimestamp(run.startedAt)}</p>
              </div>
              <StateBadge state={run.status.toLowerCase()} />
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

