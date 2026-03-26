"use client";

import { Suspense, use } from "react";
import { TerminalContainerPageContent } from "./terminal-container-page-content";

export default function TerminalContainerPage({
  params,
  searchParams,
}: {
  params: Promise<{ idOrName: string }>;
  searchParams: Promise<{ shell?: string; autoconnect?: string }>;
}) {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading terminal...</div>}>
      <ResolvedTerminalContainerPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function ResolvedTerminalContainerPage({
  params,
  searchParams,
}: {
  params: Promise<{ idOrName: string }>;
  searchParams: Promise<{ shell?: string; autoconnect?: string }>;
}) {
  const resolvedParams = use(params);
  const resolvedSearchParams = use(searchParams);

  return <TerminalContainerPageContent resolvedParams={resolvedParams} searchParams={resolvedSearchParams} />;
}
