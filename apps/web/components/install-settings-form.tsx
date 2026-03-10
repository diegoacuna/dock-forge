"use client";

import React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstallStatus } from "@dockforge/shared";
import { fetchJson } from "../lib/api";
import { Badge, Button, Input, Panel } from "./ui";

type InstallSettingsFormProps = {
  mode: "install" | "settings";
  initialStatus: InstallStatus;
};

export const InstallSettingsForm = ({ mode, initialStatus }: InstallSettingsFormProps) => {
  const router = useRouter();
  const [dockerConnectionMode, setDockerConnectionMode] = useState(initialStatus.config.dockerConnectionMode);
  const [dockerSocketPath, setDockerSocketPath] = useState(initialStatus.config.dockerSocketPath ?? "/var/run/docker.sock");
  const [dockerHost, setDockerHost] = useState(initialStatus.config.dockerHost ?? "");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isInstallMode = mode === "install";

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await fetchJson<InstallStatus>(isInstallMode ? "/install/complete" : "/install/config", {
        method: isInstallMode ? "POST" : "PUT",
        body: JSON.stringify({
          dockerConnectionMode,
          dockerSocketPath: dockerConnectionMode === "socket" ? dockerSocketPath : null,
          dockerHost: dockerConnectionMode === "host" ? dockerHost : null,
        }),
      });

      if (isInstallMode) {
        router.push("/");
        return;
      }

      setSuccessMessage("Docker connection settings saved.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save install settings.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Panel className={isInstallMode ? "border-slate-800/70 bg-slate-950/95 text-white" : "space-y-6"}>
      <div className="space-y-3">
        <Badge tone={isInstallMode ? "accent" : "neutral"}>{isInstallMode ? "First-run install" : "Docker runtime config"}</Badge>
        <div>
          <h2 className={`text-2xl font-semibold ${isInstallMode ? "text-white" : "text-slate-950"}`}>
            {isInstallMode ? "Connect DockForge to your Docker engine" : "Edit Docker connection settings"}
          </h2>
          <p className={`mt-2 max-w-2xl text-sm ${isInstallMode ? "text-slate-300" : "text-slate-600"}`}>
            {isInstallMode
              ? "Choose how DockForge should reach Docker. These values are stored in the app database and become the runtime source of truth after install."
              : "DockForge now reads these values from the app database. Changes take effect on the next API request without requiring an environment edit."}
          </p>
        </div>
      </div>

      {!initialStatus.persistenceAvailable ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${isInstallMode ? "border-amber-400/40 bg-amber-400/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          App settings persistence is unavailable until migrations are applied. Saving will fail until `pnpm db:migrate` completes.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setDockerConnectionMode("socket")}
          className={`rounded-3xl border p-5 text-left transition ${
            dockerConnectionMode === "socket"
              ? isInstallMode
                ? "border-orange-300 bg-orange-500/10"
                : "border-orange-300 bg-orange-50"
              : isInstallMode
                ? "border-white/10 bg-white/5 hover:bg-white/10"
                : "border-slate-200 bg-slate-50 hover:border-slate-300"
          }`}
        >
          <p className={`text-sm font-semibold ${isInstallMode ? "text-white" : "text-slate-950"}`}>Socket path</p>
          <p className={`mt-2 text-sm ${isInstallMode ? "text-slate-300" : "text-slate-600"}`}>
            Use a local Unix socket such as `/var/run/docker.sock`.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setDockerConnectionMode("host")}
          className={`rounded-3xl border p-5 text-left transition ${
            dockerConnectionMode === "host"
              ? isInstallMode
                ? "border-orange-300 bg-orange-500/10"
                : "border-orange-300 bg-orange-50"
              : isInstallMode
                ? "border-white/10 bg-white/5 hover:bg-white/10"
                : "border-slate-200 bg-slate-50 hover:border-slate-300"
          }`}
        >
          <p className={`text-sm font-semibold ${isInstallMode ? "text-white" : "text-slate-950"}`}>Docker host</p>
          <p className={`mt-2 text-sm ${isInstallMode ? "text-slate-300" : "text-slate-600"}`}>
            Use a host endpoint such as `tcp://127.0.0.1:2375` or `unix:///var/run/docker.sock`.
          </p>
        </button>
      </div>

      <div className="mt-6 space-y-5">
        {dockerConnectionMode === "socket" ? (
          <label className="block space-y-2">
            <span className={`text-sm font-medium ${isInstallMode ? "text-slate-100" : "text-slate-900"}`}>Docker socket path</span>
            <Input value={dockerSocketPath} onChange={(event) => setDockerSocketPath(event.target.value)} placeholder="/var/run/docker.sock" />
            <p className={`text-sm ${isInstallMode ? "text-slate-400" : "text-slate-500"}`}>The API will connect directly to this local socket.</p>
          </label>
        ) : (
          <label className="block space-y-2">
            <span className={`text-sm font-medium ${isInstallMode ? "text-slate-100" : "text-slate-900"}`}>Docker host</span>
            <Input value={dockerHost} onChange={(event) => setDockerHost(event.target.value)} placeholder="tcp://127.0.0.1:2375" />
            <p className={`text-sm ${isInstallMode ? "text-slate-400" : "text-slate-500"}`}>The API will connect to Docker using this host URL.</p>
          </label>
        )}
      </div>

      {error ? (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${isInstallMode ? "border-rose-400/40 bg-rose-400/10 text-rose-100" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{successMessage}</div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button onClick={submit} disabled={isSubmitting}>
          {isSubmitting ? (isInstallMode ? "Saving install..." : "Saving settings...") : isInstallMode ? "Finish install" : "Save settings"}
        </Button>
      </div>
    </Panel>
  );
};
