"use client";

import Link from "next/link";
import React, { Fragment, useDeferredValue, useEffect, useRef, useState } from "react";
import type { ContainerLogEntry, ContainerLogSearchMode, ContainerLogSearchResponse, ContainerLogsResponse } from "@dockforge/shared";
import { buildApiUrl, fetchJson } from "../lib/api";
import {
  appendLogEntry,
  findLogEntryMatchIndexes,
  getLogMessageMatchRanges,
  trimLogEntries,
  type LogSearchOptions,
} from "../lib/container-logs";
import { cn } from "../lib/utils";
import { Button, Input, Panel, Select } from "./ui";

const logTailOptions = [100, 200, 500] as const;
const logSearchScanOptions = [1000, 5000, 10000] as const;

type SearchMode = "compact" | "advanced";

type SearchState = {
  entries: ContainerLogEntry[];
  matchIndexes: number[];
  truncated: boolean;
};

type ContainerLogsPanelProps = {
  containerIdOrName: string;
  containerName: string;
  panelClassName?: string;
  viewportClassName?: string;
  searchMode?: SearchMode;
};

const compactSearchOptions = (query: string): LogSearchOptions => ({
  query,
  mode: "plain",
  caseSensitive: false,
});

const advancedSearchOptions = (query: string, mode: ContainerLogSearchMode, caseSensitive: boolean): LogSearchOptions => ({
  query,
  mode,
  caseSensitive,
});

const safeGetMessageMatchRanges = (message: string, options: LogSearchOptions) => {
  try {
    return getLogMessageMatchRanges(message, options);
  } catch {
    return [];
  }
};

const formatScanTail = (value: number) => (value >= 1000 ? `${value / 1000}k` : String(value));

export const ContainerLogsPanel = ({
  containerIdOrName,
  containerName,
  panelClassName,
  viewportClassName,
  searchMode = "compact",
}: ContainerLogsPanelProps) => {
  const [tailLines, setTailLines] = useState<number>(200);
  const [live, setLive] = useState(false);
  const [baseEntries, setBaseEntries] = useState<ContainerLogEntry[]>([]);
  const [baseTruncated, setBaseTruncated] = useState(false);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedMode, setAdvancedMode] = useState<ContainerLogSearchMode>("plain");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scanTail, setScanTail] = useState(5000);
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeMatchPosition, setActiveMatchPosition] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const advancedSearchActiveRef = useRef(false);
  const advancedSearchOptionsRef = useRef<LogSearchOptions | null>(null);
  const scanTailRef = useRef(scanTail);

  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const advancedSearchActive = searchMode === "advanced" && deferredSearchQuery.length > 0;
  const compactSearchActive = searchMode === "compact" && deferredSearchQuery.length > 0;
  const searchActive = advancedSearchActive || compactSearchActive;
  const compactMatchIndexes = compactSearchActive ? findLogEntryMatchIndexes(baseEntries, compactSearchOptions(deferredSearchQuery)) : [];
  const matchIndexes = advancedSearchActive ? (searchState?.matchIndexes ?? []) : compactMatchIndexes;
  const visibleEntries = advancedSearchActive ? (searchState?.entries ?? []) : baseEntries;
  const visibleTruncated = advancedSearchActive ? (searchState?.truncated ?? false) : baseTruncated;
  const visibleLoading = advancedSearchActive ? searchLoading : baseLoading;
  const visibleError = advancedSearchActive ? searchError : baseError;
  const currentMatchIndex = matchIndexes[activeMatchPosition] ?? null;
  const currentSearchOptions = advancedSearchActive
    ? advancedSearchOptions(deferredSearchQuery, advancedMode, caseSensitive)
    : compactSearchActive
      ? compactSearchOptions(deferredSearchQuery)
      : null;

  useEffect(() => {
    advancedSearchActiveRef.current = advancedSearchActive;
    advancedSearchOptionsRef.current = advancedSearchActive
      ? advancedSearchOptions(deferredSearchQuery, advancedMode, caseSensitive)
      : null;
    scanTailRef.current = scanTail;
  }, [advancedMode, advancedSearchActive, caseSensitive, deferredSearchQuery, scanTail]);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;

    const loadSnapshot = async () => {
      setBaseLoading(true);
      setBaseError(null);

      try {
        const snapshot = await fetchJson<ContainerLogsResponse>(
          `/containers/${encodeURIComponent(containerIdOrName)}/logs?tail=${tailLines}`,
        );
        if (!active) {
          return;
        }

        setBaseEntries(trimLogEntries(snapshot.entries, tailLines));
        setBaseTruncated(snapshot.truncated);
        setBaseLoading(false);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setBaseError(requestError instanceof Error ? requestError.message : `Failed to load logs for ${containerName}`);
        setBaseEntries([]);
        setBaseLoading(false);
      }
    };

    if (!live) {
      void loadSnapshot();
      return () => {
        active = false;
      };
    }

    setBaseLoading(true);
    setBaseError(null);
    eventSource = new EventSource(buildApiUrl(`/containers/${encodeURIComponent(containerIdOrName)}/logs/stream?tail=${tailLines}`));

    eventSource.addEventListener("snapshot", (event) => {
      if (!active) {
        return;
      }

      const snapshot = JSON.parse((event as MessageEvent<string>).data) as ContainerLogsResponse;
      setBaseEntries(trimLogEntries(snapshot.entries, tailLines));
      setBaseTruncated(snapshot.truncated);
      setBaseLoading(false);
    });

    eventSource.addEventListener("log", (event) => {
      if (!active) {
        return;
      }

      const entry = JSON.parse((event as MessageEvent<string>).data) as ContainerLogEntry;
      setBaseEntries((current) => appendLogEntry(current, entry, tailLines));
      setBaseLoading(false);

      if (!advancedSearchActiveRef.current) {
        return;
      }

      const nextOptions = advancedSearchOptionsRef.current;
      setSearchState((current) => {
        if (!current || !nextOptions) {
          return current;
        }

        const trimmed = current.entries.length >= scanTailRef.current ? 1 : 0;
        const nextEntries = appendLogEntry(current.entries, entry, scanTailRef.current);
        const nextMatchIndexes = current.matchIndexes.map((index) => index - trimmed).filter((index) => index >= 0);
        const matchesEntry = safeGetMessageMatchRanges(entry.message, nextOptions).length > 0;

        if (matchesEntry) {
          nextMatchIndexes.push(nextEntries.length - 1);
        }

        return {
          entries: nextEntries,
          matchIndexes: nextMatchIndexes,
          truncated: current.truncated || trimmed > 0,
        };
      });
    });

    eventSource.addEventListener("stream-error", (event) => {
      if (!active) {
        return;
      }

      const payload = JSON.parse((event as MessageEvent<string>).data) as { message: string };
      setBaseError(payload.message);
      setLive(false);
      setBaseLoading(false);
      eventSource?.close();
    });

    eventSource.onerror = () => {
      if (!active) {
        return;
      }

      setBaseError(`Live log stream disconnected for ${containerName}`);
      setLive(false);
      setBaseLoading(false);
      eventSource?.close();
    };

    return () => {
      active = false;
      eventSource?.close();
    };
  }, [containerIdOrName, containerName, live, refreshNonce, tailLines]);

  useEffect(() => {
    if (searchMode !== "advanced") {
      setSearchState(null);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    if (!advancedSearchActive) {
      setSearchState(null);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    let active = true;
    setSearchLoading(true);
    setSearchError(null);

    const params = new URLSearchParams({
      query: deferredSearchQuery,
      mode: advancedMode,
      caseSensitive: String(caseSensitive),
      scanTail: String(scanTail),
    });

    void fetchJson<ContainerLogSearchResponse>(
      `/containers/${encodeURIComponent(containerIdOrName)}/logs/search?${params.toString()}`,
    )
      .then((response) => {
        if (!active) {
          return;
        }

        setSearchState({
          entries: response.entries,
          matchIndexes: response.matchIndexes,
          truncated: response.truncated,
        });
        setSearchLoading(false);
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setSearchState(null);
        setSearchError(requestError instanceof Error ? requestError.message : `Failed to search logs for ${containerName}`);
        setSearchLoading(false);
      });

    return () => {
      active = false;
    };
  }, [advancedMode, advancedSearchActive, caseSensitive, containerIdOrName, containerName, deferredSearchQuery, refreshNonce, scanTail, searchMode]);

  useEffect(() => {
    setActiveMatchPosition(0);
  }, [advancedMode, caseSensitive, deferredSearchQuery, scanTail, searchMode]);

  useEffect(() => {
    setActiveMatchPosition((current) => {
      if (matchIndexes.length === 0) {
        return 0;
      }

      return Math.min(current, matchIndexes.length - 1);
    });
  }, [matchIndexes]);

  useEffect(() => {
    if (!scrollRef.current || visibleLoading || visibleEntries.length === 0 || searchActive) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [searchActive, visibleEntries, visibleLoading]);

  useEffect(() => {
    if (!searchActive || currentMatchIndex == null) {
      return;
    }

    lineRefs.current[currentMatchIndex]?.scrollIntoView?.({
      block: "center",
    });
  }, [currentMatchIndex, searchActive, visibleEntries]);

  useEffect(() => {
    if (searchMode !== "advanced") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const targetTag = target?.tagName?.toLowerCase();
      const isTypingTarget = targetTag === "input" || targetTag === "textarea" || target?.isContentEditable;

      if (event.key === "/" && !isTypingTarget) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [searchMode]);

  const moveToNextMatch = () => {
    if (matchIndexes.length === 0) {
      return;
    }

    setActiveMatchPosition((current) => (current + 1) % matchIndexes.length);
  };

  const moveToPreviousMatch = () => {
    if (matchIndexes.length === 0) {
      return;
    }

    setActiveMatchPosition((current) => (current - 1 + matchIndexes.length) % matchIndexes.length);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchError(null);
    setSearchState(null);
    setActiveMatchPosition(0);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        moveToPreviousMatch();
        return;
      }

      moveToNextMatch();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
    }
  };

  const renderHighlightedMessage = (entry: ContainerLogEntry) => {
    if (!currentSearchOptions) {
      return entry.message || " ";
    }

    const ranges = safeGetMessageMatchRanges(entry.message, currentSearchOptions);
    if (ranges.length === 0) {
      return entry.message || " ";
    }

    const segments: React.ReactNode[] = [];
    let cursor = 0;

    for (const [rangeIndex, range] of ranges.entries()) {
      if (range.start > cursor) {
        segments.push(
          <Fragment key={`text-${rangeIndex}-${cursor}`}>
            {entry.message.slice(cursor, range.start)}
          </Fragment>,
        );
      }

      segments.push(
        <mark key={`match-${rangeIndex}-${range.start}`} className="rounded bg-amber-300/90 px-0.5 text-slate-950">
          {entry.message.slice(range.start, range.end)}
        </mark>,
      );
      cursor = range.end;
    }

    if (cursor < entry.message.length) {
      segments.push(<Fragment key={`tail-${cursor}`}>{entry.message.slice(cursor)}</Fragment>);
    }

    return segments.length > 0 ? segments : " ";
  };

  return (
    <Panel className={cn("space-y-4", panelClassName)}>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Logs for {containerName}</p>
            <p className="text-xs text-slate-500">
              Showing the last {advancedSearchActive ? scanTail : tailLines} lines{visibleTruncated ? " from a larger log stream" : ""}.
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
            <Button variant="ghost" disabled={live || visibleLoading} onClick={() => setRefreshNonce((current) => current + 1)}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchMode === "advanced" ? "Search logs or use regex" : "Find in loaded logs"}
              aria-label={searchMode === "advanced" ? `Search logs for ${containerName}` : `Find log lines for ${containerName}`}
              className="md:max-w-md"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" disabled={matchIndexes.length === 0} onClick={moveToPreviousMatch}>
                Prev
              </Button>
              <Button variant="ghost" disabled={matchIndexes.length === 0} onClick={moveToNextMatch}>
                Next
              </Button>
              <span className="min-w-[4.5rem] text-sm text-slate-500">
                {matchIndexes.length === 0 ? "0 / 0" : `${activeMatchPosition + 1} / ${matchIndexes.length}`}
              </span>
              {searchQuery.length > 0 ? (
                <Button variant="ghost" onClick={clearSearch}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          {searchMode === "advanced" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={advancedMode}
                onChange={(event) => setAdvancedMode(event.target.value as ContainerLogSearchMode)}
                className="w-auto min-w-[7rem]"
              >
                <option value="plain">Plain text</option>
                <option value="regex">Regex</option>
              </Select>
              <Button variant={caseSensitive ? "secondary" : "ghost"} onClick={() => setCaseSensitive((current) => !current)}>
                Case {caseSensitive ? "on" : "off"}
              </Button>
              <Select value={String(scanTail)} onChange={(event) => setScanTail(Number(event.target.value))} className="w-auto min-w-[7rem]">
                {logSearchScanOptions.map((option) => (
                  <option key={option} value={option}>
                    Scan {formatScanTail(option)}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-slate-500">Advanced search scans Docker-backed history on demand.</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">Compact search only looks inside the loaded tail and live buffer.</p>
              <Link
                href={`/containers/${encodeURIComponent(containerIdOrName)}?tab=Logs`}
                className="text-sm font-medium text-orange-600 transition hover:text-orange-700"
              >
                Open full log search
              </Link>
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn("max-h-96 overflow-y-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-100", viewportClassName)}
      >
        {visibleLoading ? <p className="text-slate-400">{advancedSearchActive ? "Searching logs…" : "Loading logs…"}</p> : null}
        {!visibleLoading && visibleError ? <p className="text-rose-300">{visibleError}</p> : null}
        {!visibleLoading && !visibleError && visibleEntries.length === 0 && !searchActive ? (
          <p className="text-slate-400">No logs available for this container.</p>
        ) : null}
        {!visibleLoading && !visibleError && searchActive && visibleEntries.length === 0 ? (
          <p className="text-slate-400">
            {advancedSearchActive ? `No matching log lines found in the last ${scanTail} lines.` : "No matching log lines found in the loaded logs."}
          </p>
        ) : null}
        {!visibleLoading && !visibleError && visibleEntries.length > 0 ? (
          <div className="space-y-1">
            {visibleEntries.map((entry, index) => {
              const isMatched = matchIndexes.includes(index);
              const isActiveMatch = currentMatchIndex === index;

              return (
                <div
                  key={`${entry.timestamp ?? "no-timestamp"}-${index}`}
                  ref={(element) => {
                    lineRefs.current[index] = element;
                  }}
                  className={cn(
                    "rounded-md px-2 py-1 transition",
                    entry.stream === "stderr" ? "text-amber-300" : "text-slate-100",
                    isMatched ? "bg-white/5" : "",
                    isActiveMatch ? "bg-orange-500/20 ring-1 ring-orange-400/70" : "",
                  )}
                >
                  {entry.timestamp ? <span className="mr-2 text-slate-500">{entry.timestamp}</span> : null}
                  <span className="mr-2 uppercase text-[10px] tracking-[0.2em] text-slate-500">{entry.stream}</span>
                  <span className="whitespace-pre-wrap break-words">{renderHighlightedMessage(entry)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </Panel>
  );
};
