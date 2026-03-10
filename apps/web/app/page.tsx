"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardData } from "@dockforge/shared";
import { useApiQuery } from "../lib/api";
import { formatTimestamp } from "../lib/utils";
import { DashboardOnboarding, DashboardOnboardingEmptyState } from "../components/dashboard-onboarding";
import { DASHBOARD_ONBOARDING_DISMISSED_KEY, shouldShowDashboardOnboarding } from "../lib/onboarding";
import { Button, PageHeader, Panel, StatCard } from "../components/ui";
import { StateBadge } from "../components/status";

export default function DashboardPage() {
  const { data } = useApiQuery<DashboardData>(["dashboard"], "/dashboard", 10_000);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [manualOnboardingOpen, setManualOnboardingOpen] = useState(false);
  const [onboardingHydrated, setOnboardingHydrated] = useState(false);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(DASHBOARD_ONBOARDING_DISMISSED_KEY) === "true";
    setOnboardingDismissed(dismissed);
    setOnboardingHydrated(true);
  }, []);

  useEffect(() => {
    if ((data?.totalGroups ?? 0) > 0) {
      window.localStorage.removeItem(DASHBOARD_ONBOARDING_DISMISSED_KEY);
      setOnboardingDismissed(false);
    }
  }, [data?.totalGroups]);

  const dismissOnboarding = () => {
    window.localStorage.setItem(DASHBOARD_ONBOARDING_DISMISSED_KEY, "true");
    setOnboardingDismissed(true);
    setManualOnboardingOpen(false);
  };

  const restartOnboarding = () => {
    window.localStorage.removeItem(DASHBOARD_ONBOARDING_DISMISSED_KEY);
    setOnboardingDismissed(false);
    setManualOnboardingOpen(true);
  };

  const canEvaluateOnboarding = onboardingHydrated || manualOnboardingOpen;
  const showOnboarding =
    canEvaluateOnboarding && (manualOnboardingOpen || shouldShowDashboardOnboarding(data?.totalGroups ?? 0, onboardingDismissed));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Craft your local Docker empire with group orchestration, dependency-aware startup, and live inspection."
        actions={
          !showOnboarding ? (
            <Button variant="ghost" onClick={restartOnboarding}>
              Show onboarding again
            </Button>
          ) : undefined
        }
      />

      {showOnboarding ? <DashboardOnboarding onSkip={dismissOnboarding} /> : null}

      {canEvaluateOnboarding && !showOnboarding && (data?.totalGroups ?? 0) === 0 ? <DashboardOnboardingEmptyState onRestart={restartOnboarding} /> : null}

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
