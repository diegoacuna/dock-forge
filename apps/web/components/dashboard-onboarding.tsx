"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Boxes, Container, Network, PlayCircle } from "lucide-react";
import { dashboardOnboardingSteps, DASHBOARD_ONBOARDING_DISMISSED_KEY, getCreateGroupHref } from "../lib/onboarding";
import { Badge, Button, Panel, StatCard } from "./ui";

const featureCards = [
  {
    title: "Containers",
    description: "Inspect state, ports, logs, inspect JSON, and terminal access for each running service.",
    icon: Container,
  },
  {
    title: "Groups",
    description: "Create app-managed groups so related containers can be operated as one stack.",
    icon: Boxes,
  },
  {
    title: "Execution",
    description: "Use graph edges and execution stages to make startup order clear and dependable.",
    icon: PlayCircle,
  },
  {
    title: "Networks & More",
    description: "Review networks, volumes, and activity history without losing access to raw Docker detail.",
    icon: Network,
  },
];

export const DashboardOnboarding = ({ onSkip }: { onSkip: () => void }) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    window.localStorage.removeItem(DASHBOARD_ONBOARDING_DISMISSED_KEY);
  }, []);

  const currentStep = dashboardOnboardingSteps[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === dashboardOnboardingSteps.length - 1;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-panel">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge tone="accent">Welcome to DockForge</Badge>
              <p className="max-w-2xl text-sm leading-6 text-slate-300">
                This short tour shows what DockForge is for, what value each area gives you, and the fastest way to get started: create a group, then attach the containers that belong in it.
              </p>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{currentStep.eyebrow}</p>
                <h1 className="mt-3 text-4xl font-semibold leading-tight text-white">{currentStep.title}</h1>
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
              <Button variant="ghost" disabled={isFirstStep} onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}>
                Back
              </Button>
              <Button variant="ghost" onClick={onSkip}>
                Skip
              </Button>
              {!isLastStep ? (
                <Button variant="primary" onClick={() => setStepIndex((current) => Math.min(current + 1, dashboardOnboardingSteps.length - 1))}>
                  Next
                </Button>
              ) : (
                <Link href={getCreateGroupHref(true)}>
                  <Button>
                    Create my first group
                    <ArrowRight className="ml-2 inline h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Tour progress</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Step {stepIndex + 1} of {dashboardOnboardingSteps.length}
                  </p>
                </div>
                <div className="flex gap-2">
                  {dashboardOnboardingSteps.map((step, index) => (
                    <span
                      key={step.id}
                      className={`h-2.5 w-10 rounded-full ${index === stepIndex ? "bg-orange-400" : "bg-white/15"}`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {dashboardOnboardingSteps.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setStepIndex(index)}
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
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {featureCards.map((feature) => {
          const Icon = feature.icon;

          return (
            <Panel key={feature.title} className="bg-white">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-950">{feature.title}</p>
                  <p className="text-sm text-slate-500">{feature.description}</p>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Goal" value="1 group" hint="Create the first orchestration group" />
        <StatCard label="Next" value="Attach" hint="Bulk-attach a folder or pick containers manually" />
        <StatCard label="After That" value="Graph" hint="Add dependency edges and execution order" />
        <StatCard label="Source" value="Docker" hint="Runtime state still comes from live Docker data" />
      </div>
    </div>
  );
};

export const DashboardOnboardingEmptyState = ({ onRestart }: { onRestart: () => void }) => (
  <Panel className="space-y-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">No groups yet</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Create your first orchestration group</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Reopen the tour if you want a quick reminder of how groups, container management, logs, terminal access, and orchestration fit together before you create the first group.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" onClick={onRestart}>
          Show onboarding again
        </Button>
        <Link href={getCreateGroupHref(true)}>
          <Button>Create my first group</Button>
        </Link>
      </div>
    </div>
  </Panel>
);
