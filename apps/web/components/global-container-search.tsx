"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ContainerSummary, GroupsPageData } from "@dockforge/shared";
import { useApiQuery } from "../lib/api";
import { searchCommandPalette } from "../lib/container-command-search";
import { cn } from "../lib/utils";
import { StateBadge } from "./status";
import { Badge, Button, Input } from "./ui";

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

export const GlobalContainerSearch = () => {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const {
    data: containers,
    error: containersError,
    isLoading: containersLoading,
  } = useApiQuery<ContainerSummary[]>(["global-container-search", "containers"], "/containers", 8_000);
  const {
    data: groupsPageData,
    error: groupsError,
    isLoading: groupsLoading,
  } = useApiQuery<GroupsPageData>(["global-container-search", "groups"], "/groups/page-data", 8_000);
  const results = useMemo(
    () => searchCommandPalette(containers ?? [], groupsPageData?.groups ?? [], deferredQuery, 8),
    [containers, deferredQuery, groupsPageData?.groups],
  );
  const isLoading = containersLoading || groupsLoading;
  const error = containersError ?? groupsError;

  const close = () => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
  };

  const open = () => {
    setIsOpen(true);
    setSelectedIndex(0);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        if (event.key === "Escape") {
          close();
        }
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== "k" && key !== "f") {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      open();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [deferredQuery]);

  useEffect(() => {
    close();
  }, [pathname]);

  const openSelectedResult = () => {
    const selected = results[selectedIndex];
    if (!selected) {
      return;
    }

    close();
    router.push(selected.href);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openSelectedResult();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-end">
        <button
          type="button"
          onClick={open}
          className="group flex w-full max-w-xl items-center gap-3 rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-left shadow-panel transition hover:border-orange-300 hover:bg-white md:w-auto md:min-w-[24rem]"
          aria-label="Open global search"
        >
          <div className="rounded-xl bg-slate-100 p-2 text-slate-500 transition group-hover:bg-orange-50 group-hover:text-orange-700">
            <Search className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">Search containers and groups</p>
            <p className="truncate text-xs text-slate-500">Jump into a container, group, or a specific group section from anywhere in DockForge.</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <kbd className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-medium">Cmd K</kbd>
            <span>/</span>
            <kbd className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-medium">Cmd F</kbd>
          </div>
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-12 backdrop-blur-sm" onClick={close}>
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Search className="h-4 w-4 text-slate-500" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search by container, group, slug, image, project, or section"
                  aria-label="Search containers and groups"
                  className="border-0 bg-transparent px-0 py-0 text-base focus:border-0"
                />
                <Button variant="ghost" onClick={close}>
                  Close
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge tone="accent">Global Search</Badge>
                <span>Use arrows to move, Enter to open, Esc to close.</span>
              </div>
            </div>

            <div className="max-h-[28rem] overflow-y-auto p-3">
              {isLoading ? <p className="rounded-2xl px-4 py-6 text-sm text-slate-500">Loading search index…</p> : null}
              {!isLoading && error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                  {error instanceof Error ? error.message : "Global search is unavailable right now."}
                </div>
              ) : null}
              {!isLoading && !error && results.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    {query.trim() ? "No containers or groups match that search." : "No containers available to search."}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {query.trim()
                      ? "Try a container name, group name, slug, image, compose project, or a section like graph or runs."
                      : "Start a container to populate the global search list."}
                  </p>
                </div>
              ) : null}
              {!isLoading && !error && results.length > 0 ? (
                <div className="space-y-2">
                  {results.map((result, index) => (
                    <Link
                      key={result.id}
                      href={result.href}
                      onClick={close}
                      className={cn(
                        "block rounded-2xl border px-4 py-3 transition",
                        index === selectedIndex ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-950">{result.name}</p>
                            <StateBadge state={result.state} />
                            <Badge tone={result.kind === "container" ? "neutral" : result.kind === "group" ? "accent" : "warning"}>
                              {result.kind === "container" ? "Container" : result.kind === "group" ? "Group" : "Group section"}
                            </Badge>
                            {result.kind === "group-section" ? <Badge tone="accent">{result.sectionLabel}</Badge> : null}
                          </div>
                          <p className="mt-1 truncate text-sm text-slate-600">
                            {result.kind === "container"
                              ? result.imageLabel
                              : result.kind === "group"
                                ? result.description || `Open the ${result.slugLabel} group overview.`
                                : `Jump straight to ${result.sectionLabel} in the ${result.slugLabel} group.`}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                            {result.kind === "container" && result.projectLabel ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1">Project {result.projectLabel}</span>
                            ) : null}
                            {result.kind === "container" && result.groupLabel ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1">Group {result.groupLabel}</span>
                            ) : null}
                            {result.kind !== "container" ? <span className="rounded-full bg-slate-100 px-2 py-1">Slug {result.slugLabel}</span> : null}
                            {result.kind !== "container" ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1">
                                {result.memberCount} container{result.memberCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                            {result.kind !== "container" ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1">
                                {result.dependencyCount} dependenc{result.dependencyCount === 1 ? "y" : "ies"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-slate-400">Open</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
