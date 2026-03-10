"use client";

import React, { useState } from "react";
import { ArrowRight, Boxes, Database, PlugZap } from "lucide-react";
import type { InstallStatus } from "@dockforge/shared";
import { Badge, Button, Panel } from "./ui";
import { InstallSettingsForm } from "./install-settings-form";

const featureCards = [
  {
    title: "Groups are app-managed",
    description: "DockForge keeps stack membership, dependency edges, and execution order in the database instead of Docker labels.",
    icon: Boxes,
  },
  {
    title: "Runtime still comes from Docker",
    description: "Inspect live state, logs, raw inspect JSON, and helper terminal commands without hiding the underlying runtime.",
    icon: PlugZap,
  },
  {
    title: "App state is persisted",
    description: "DockForge stores its app-managed state in a local SQLite database so groups, graph layout, history, and setup survive restarts.",
    icon: Database,
  },
];

export const InstallFlow = ({ initialStatus }: { initialStatus: InstallStatus }) => {
  const [step, setStep] = useState<"welcome" | "configure">("welcome");

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-8 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="flex flex-col justify-between rounded-[2.25rem] border border-white/10 bg-slate-950/70 p-8 text-white shadow-panel backdrop-blur">
        <div className="space-y-8">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.34em] text-orange-300">DockForge install</p>
            <h1 className="max-w-xl text-5xl font-semibold leading-tight">
              {step === "welcome" ? "Welcome to DockForge." : "Set the runtime source of truth before the dashboard opens."}
            </h1>
            <p className="max-w-xl text-sm leading-6 text-slate-300">
              {step === "welcome"
                ? "DockForge helps you organize containers into app-managed groups, preserve orchestration metadata in the database, and keep direct access to raw Docker runtime detail."
                : "Choose how DockForge should reach Docker. These values are stored in the app database and used before the dashboard, groups, and orchestration views are unlocked."}
            </p>
          </div>

          <div className="grid gap-4">
            {featureCards.map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-orange-500/15 p-3 text-orange-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="mt-2 text-sm text-slate-300">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex items-center gap-2">
          {["welcome", "configure"].map((item) => (
            <span
              key={item}
              className={`h-2.5 w-12 rounded-full ${step === item ? "bg-orange-400" : "bg-white/15"}`}
              aria-hidden="true"
            />
          ))}
        </div>
      </section>

      <div className="flex items-center">
        {step === "welcome" ? (
          <Panel className="border-slate-800/70 bg-slate-950/95 text-white">
            <div className="space-y-5">
              <Badge tone="accent">Step 1 of 2</Badge>
              <div>
                <h2 className="text-2xl font-semibold text-white">What DockForge gives you</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Groups become the center of the product, the graph stays useful instead of decorative, and raw Docker detail remains reachable whenever you need it.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-sm font-semibold text-white">Groups</p>
                  <p className="mt-2 text-sm text-slate-300">Model one stack the way your team thinks about it, even when a container belongs to multiple groups.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-sm font-semibold text-white">Execution graph</p>
                  <p className="mt-2 text-sm text-slate-300">Validate DAGs, express dependency order, and make orchestration stages explicit before you run anything.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-sm font-semibold text-white">Runtime inspection</p>
                  <p className="mt-2 text-sm text-slate-300">Keep logs, raw inspect JSON, volumes, networks, and helper terminal commands close to the orchestration view.</p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setStep("configure")}>
                  Next: configure Docker
                  <ArrowRight className="ml-2 inline h-4 w-4" />
                </Button>
              </div>
            </div>
          </Panel>
        ) : (
          <InstallSettingsForm mode="install" initialStatus={initialStatus} />
        )}
      </div>
    </div>
  );
};
