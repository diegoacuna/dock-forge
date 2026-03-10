"use client";

import Link from "next/link";
import { Boxes, FileSearch, PlusCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GroupsPageData } from "@dockforge/shared";
import { fetchJson, useApiQuery } from "../../lib/api";
import { PageHeader, Panel, Table, Button } from "../../components/ui";
import { StateBadge } from "../../components/status";
import { shouldShowGroupsOnboarding } from "../../lib/onboarding";

const groupsTourSteps = [
  {
    id: "overview",
    eyebrow: "Groups Area",
    title: "Groups are the app-managed home for your stack",
    description:
      "Use Groups when you want DockForge to remember container membership, keep orchestration rules in the app database, and coordinate several services as one working unit.",
    bullets: [
      "A group gives related containers one place for orchestration, graph editing, and run history.",
      "Membership and dependency rules live in DockForge rather than in Docker labels.",
    ],
    icon: Boxes,
  },
  {
    id: "table",
    eyebrow: "Groups Table",
    title: "The list shows what each group controls right now",
    description:
      "Use the table to scan membership, dependency count, and last orchestration result before drilling into a group detail page.",
    bullets: [
      "Open the group name to jump into overview, containers, graph, execution order, and activity.",
      "Container and dependency counts give you a quick read on group complexity before you open it.",
    ],
    icon: FileSearch,
  },
  {
    id: "actions",
    eyebrow: "Primary Actions",
    title: "Create new groups and remove old ones from this page",
    description:
      "The page keeps the highest-value actions close at hand: create a new orchestration group from the header or delete a row that is no longer needed.",
    bullets: [
      "Use Create group to define a new stack and then move into attach and dependency setup.",
      "Use the row Delete button carefully when a group is obsolete and should be removed from DockForge.",
    ],
    icon: PlusCircle,
  },
] as const;

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourMutationPending, setTourMutationPending] = useState(false);
  const [tourError, setTourError] = useState<string | null>(null);
  const [tourDismissed, setTourDismissed] = useState(false);
  const { data: pageData, isLoading, error } = useApiQuery<GroupsPageData>(["groups-page-data"], "/groups/page-data", 8_000);
  const groups = pageData?.groups ?? [];
  const showGroupsTour = shouldShowGroupsOnboarding({
    totalGroups: groups.length,
    seen: (pageData?.onboarding.groupsTourSeen ?? false) || tourDismissed,
  });
  const showReplayTourButton = groups.length > 0 && !showGroupsTour;

  useEffect(() => {
    if (!pageData?.onboarding.groupsTourSeen) {
      setTourDismissed(false);
    }
  }, [pageData?.onboarding.groupsTourSeen]);

  const updateGroupsTourSeen = async (seen: boolean) => {
    setTourMutationPending(true);
    setTourError(null);

    try {
      await fetchJson("/onboarding/groups-tour", {
        method: "POST",
        body: JSON.stringify({ groupsTourSeen: seen }),
      });
      setTourDismissed(seen);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["groups-page-data"] }),
        queryClient.invalidateQueries({ queryKey: ["groups"] }),
      ]);
      if (!seen) {
        setTourStepIndex(0);
      }
    } catch (error) {
      setTourError(error instanceof Error ? error.message : "Failed to update the groups tour state.");
    } finally {
      setTourMutationPending(false);
    }
  };

  const deleteGroup = async (groupId: string) => {
    await fetchJson(`/groups/${groupId}`, { method: "DELETE" });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["groups-page-data"] }),
      queryClient.invalidateQueries({ queryKey: ["groups"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="App-managed orchestration groups with shared containers and group-specific dependency DAGs."
        actions={
          <>
            {showReplayTourButton ? (
              <Button variant="ghost" disabled={tourMutationPending} onClick={() => void updateGroupsTourSeen(false)}>
                Show tour again
              </Button>
            ) : null}
            <Link href="/groups/new">
              <Button>Create group</Button>
            </Link>
          </>
        }
      />

      {isLoading ? (
        <Panel>
          <p className="text-sm text-slate-600">Loading groups…</p>
        </Panel>
      ) : null}

      {!isLoading && error ? (
        <Panel>
          <p className="text-sm text-rose-700">{error instanceof Error ? error.message : "The Groups page request failed."}</p>
        </Panel>
      ) : null}

      {!isLoading && !error && showGroupsTour ? (
        <GroupsOnboardingPanel
          stepIndex={tourStepIndex}
          onStepChange={setTourStepIndex}
          onDismiss={() => void updateGroupsTourSeen(true)}
          pending={tourMutationPending}
          persistenceAvailable={pageData?.onboarding.persistenceAvailable ?? true}
        />
      ) : null}

      {!isLoading && !error ? (
      <Panel>
        {tourError ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{tourError}</div>
        ) : null}
        {!showGroupsTour && pageData && !pageData.onboarding.persistenceAvailable ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Groups tour persistence is unavailable until migrations are applied. Run <code>pnpm db:migrate</code>.
          </div>
        ) : null}
        {groups.length === 0 ? (
          <EmptyGroupsState />
        ) : (
        <Table>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Containers</th>
              <th className="px-3 py-2">Dependencies</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id} className="bg-slate-50">
                <td className="px-3 py-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-md border border-slate-200 shadow-sm"
                      style={{ backgroundColor: group.color ?? "#e2e8f0" }}
                      aria-hidden="true"
                    />
                    <div>
                      <Link href={`/groups/${group.id}`} className="font-medium text-slate-950">{group.name}</Link>
                      <p className="text-xs text-slate-500">{group.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4">{group.memberCount}</td>
                <td className="px-3 py-4">{group.dependencyCount}</td>
                <td className="px-3 py-4"><StateBadge state={group.lastRunStatus?.toLowerCase()} /></td>
                <td className="px-3 py-4">
                  <Button
                    variant="danger"
                    onClick={() => void deleteGroup(group.id)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        )}
      </Panel>
      ) : null}
    </div>
  );
}

const EmptyGroupsState = () => (
  <div className="space-y-4">
    <p className="text-sm font-medium text-slate-900">No groups yet.</p>
    <p className="text-sm text-slate-600">
      Create your first group to organize related containers, store orchestration rules in DockForge, and unlock dependency-aware startup and shutdown.
    </p>
  </div>
);

const GroupsOnboardingPanel = ({
  stepIndex,
  onStepChange,
  onDismiss,
  pending,
  persistenceAvailable,
}: {
  stepIndex: number;
  onStepChange: (index: number) => void;
  onDismiss: () => void;
  pending: boolean;
  persistenceAvailable: boolean;
}) => {
  const currentStep = groupsTourSteps[stepIndex];
  const Icon = currentStep.icon;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === groupsTourSteps.length - 1;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-panel">
      <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700">Groups Tour</div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3 text-orange-300">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{currentStep.eyebrow}</p>
                <h2 className="mt-2 text-3xl font-semibold leading-tight text-white">{currentStep.title}</h2>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">{currentStep.description}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {currentStep.bullets.map((bullet) => (
              <div key={bullet} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                {bullet}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" disabled={isFirstStep || pending} onClick={() => onStepChange(Math.max(stepIndex - 1, 0))}>
              Back
            </Button>
            <Button variant="ghost" disabled={pending} onClick={onDismiss}>
              Skip tour
            </Button>
            {!isLastStep ? (
              <Button variant="primary" disabled={pending} onClick={() => onStepChange(Math.min(stepIndex + 1, groupsTourSteps.length - 1))}>
                Next
              </Button>
            ) : (
              <Button variant="primary" disabled={pending} onClick={onDismiss}>
                Finish tour
              </Button>
            )}
          </div>

          {!persistenceAvailable ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              DockForge cannot remember tour completion until migrations are applied. Run <code>pnpm db:migrate</code>.
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Tour progress</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  Step {stepIndex + 1} of {groupsTourSteps.length}
                </p>
              </div>
              <div className="flex gap-2">
                {groupsTourSteps.map((step, index) => (
                  <span
                    key={step.id}
                    className={`h-2.5 w-10 rounded-full ${index === stepIndex ? "bg-orange-400" : "bg-white/15"}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {groupsTourSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onStepChange(index)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    index === stepIndex ? "border-orange-300 bg-orange-500/10 text-white" : "border-white/10 bg-white/0 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{step.eyebrow}</p>
                  <p className="mt-1 text-sm font-medium">{step.title}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              Groups keep membership and dependency rules in DockForge instead of Docker metadata.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              Open a group from the table when you need containers, graph, execution order, or activity.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              Create and delete actions stay on this page so stack ownership remains easy to manage.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
