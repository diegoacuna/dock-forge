"use client";

import { Suspense, use } from "react";
import { ContainerDetailPageContent } from "./container-detail-page-content";

export default function ContainerDetailPage({ params }: { params: Promise<{ idOrName: string }> }) {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading container...</div>}>
      <ResolvedContainerDetailPage params={params} />
    </Suspense>
  );
}

function ResolvedContainerDetailPage({ params }: { params: Promise<{ idOrName: string }> }) {
  const resolvedParams = use(params);
  return <ContainerDetailPageContent resolvedParams={resolvedParams} />;
}
