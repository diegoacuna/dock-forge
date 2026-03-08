"use client";

import { use } from "react";
import type { NetworkDetail } from "@dockforge/shared";
import { useApiQuery } from "../../../lib/api";
import { CopyButton, PageHeader, Panel } from "../../../components/ui";

export default function NetworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data } = useApiQuery<NetworkDetail>(["network", resolvedParams.id], `/networks/${resolvedParams.id}`, 12_000);

  return (
    <div className="space-y-6">
      <PageHeader title={data?.name ?? resolvedParams.id} description="Docker network detail, connected containers, and raw inspect data." />
      <Panel>
        <p><strong>Driver:</strong> {data?.driver ?? "—"}</p>
        <p><strong>Scope:</strong> {data?.scope ?? "—"}</p>
        <p><strong>Subnet:</strong> {data?.subnet ?? "—"}</p>
        <p><strong>Gateway:</strong> {data?.gateway ?? "—"}</p>
      </Panel>
      <Panel>
        <div className="mb-3 flex justify-end"><CopyButton text={JSON.stringify(data?.inspect ?? {}, null, 2)} /></div>
        <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(data?.inspect ?? {}, null, 2)}</pre>
      </Panel>
    </div>
  );
}
