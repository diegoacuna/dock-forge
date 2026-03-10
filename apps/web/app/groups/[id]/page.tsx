"use client";

import React, { Suspense, use } from "react";
import { GroupDetailPageContent } from "./group-detail-page-content";

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading group...</div>}>
      <ResolvedGroupDetailPage params={params} />
    </Suspense>
  );
}

function ResolvedGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  return <GroupDetailPageContent resolvedParams={resolvedParams} />;
}
