"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ContainerLogEntry, ContainerLogsResponse } from "@dockforge/shared";
import { buildApiUrl, fetchJson } from "../lib/api";
import { appendLogEntry, trimLogEntries } from "../lib/container-logs";
import { cn } from "../lib/utils";
import { Button, Panel, Select } from "./ui";

const logTailOptions = [100, 200, 500] as const;

type ContainerLogsPanelProps = {
  containerIdOrName: string;
  containerName: string;
  panelClassName?: string;
  viewportClassName?: string;
};

export const ContainerLogsPanel = ({
  containerIdOrName,
  containerName,
  panelClassName,
  viewportClassName,
}: ContainerLogsPanelProps) => {
  const [tailLines, setTailLines] = useState<number>(200);
  const [live, setLive] = useState(false);
  const [entries, setEntries] = useState<ContainerLogEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;

    const loadSnapshot = async () => {
      setLoading(true);
      setError(null);

      try {
        const snapshot = await fetchJson<ContainerLogsResponse>(
          `/containers/${encodeURIComponent(containerIdOrName)}/logs?tail=${tailLines}`,
        );
        if (!active) {
          return;
        }

        setEntries(trimLogEntries(snapshot.entries, tailLines));
        setTruncated(snapshot.truncated);
        setLoading(false);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : `Failed to load logs for ${containerName}`);
        setEntries([]);
        setLoading(false);
      }
    };

    if (!live) {
      void loadSnapshot();
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    eventSource = new EventSource(buildApiUrl(`/containers/${encodeURIComponent(containerIdOrName)}/logs/stream?tail=${tailLines}`));

    eventSource.addEventListener("snapshot", (event) => {
      if (!active) {
        return;
      }

      const snapshot = JSON.parse((event as MessageEvent<string>).data) as ContainerLogsResponse;
      setEntries(trimLogEntries(snapshot.entries, tailLines));
      setTruncated(snapshot.truncated);
      setLoading(false);
    });

    eventSource.addEventListener("log", (event) => {
      if (!active) {
        return;
      }

      const entry = JSON.parse((event as MessageEvent<string>).data) as ContainerLogEntry;
      setEntries((current) => appendLogEntry(current, entry, tailLines));
      setLoading(false);
    });

    eventSource.addEventListener("stream-error", (event) => {
      if (!active) {
        return;
      }

      const payload = JSON.parse((event as MessageEvent<string>).data) as { message: string };
      setError(payload.message);
      setLive(false);
      setLoading(false);
      eventSource?.close();
    });

    eventSource.onerror = () => {
      if (!active) {
        return;
      }

      setError(`Live log stream disconnected for ${containerName}`);
      setLive(false);
      setLoading(false);
      eventSource?.close();
    };

    return () => {
      active = false;
      eventSource?.close();
    };
  }, [containerIdOrName, containerName, live, refreshNonce, tailLines]);

  useEffect(() => {
    if (!scrollRef.current || loading || entries.length === 0) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, live, loading, tailLines]);

  return (
    <Panel className={cn("space-y-4", panelClassName)}>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Logs for {containerName}</p>
          <p className="text-xs text-slate-500">
            Showing the last {tailLines} lines{truncated ? " from a larger log stream" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <span>Live</span>
            <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${live ? "bg-orange-500" : "bg-slate-300"}`}>
              <input
                type="checkbox"
                checked={live}
                onChange={(event) => setLive(event.target.checked)}
                className="peer sr-only"
                aria-label={`Toggle live logs for ${containerName}`}
              />
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition ${live ? "translate-x-5" : "translate-x-1"}`} />
            </span>
          </label>
          <Select value={String(tailLines)} onChange={(event) => setTailLines(Number(event.target.value))} className="w-auto min-w-[7rem]">
            {logTailOptions.map((option) => (
              <option key={option} value={option}>
                Last {option}
              </option>
            ))}
          </Select>
          <Button variant="ghost" disabled={live || loading} onClick={() => setRefreshNonce((current) => current + 1)}>
            Refresh
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn("max-h-96 overflow-y-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-100", viewportClassName)}
      >
        {loading ? <p className="text-slate-400">Loading logs…</p> : null}
        {!loading && error ? <p className="text-rose-300">{error}</p> : null}
        {!loading && !error && entries.length === 0 ? <p className="text-slate-400">No logs available for this container.</p> : null}
        {!loading && !error && entries.length > 0 ? (
          <div className="space-y-1">
            {entries.map((entry, index) => (
              <div
                key={`${entry.timestamp ?? "no-timestamp"}-${index}`}
                className={entry.stream === "stderr" ? "text-amber-300" : "text-slate-100"}
              >
                {entry.timestamp ? <span className="mr-2 text-slate-500">{entry.timestamp}</span> : null}
                <span className="mr-2 uppercase text-[10px] tracking-[0.2em] text-slate-500">{entry.stream}</span>
                <span className="whitespace-pre-wrap break-words">{entry.message || " "}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
};
