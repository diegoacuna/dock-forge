"use client";

import { use } from "react";
import type { VolumeDetail } from "@dockforge/shared";
import { useApiQuery } from "../../../lib/api";
import { CopyButton, PageHeader, Panel } from "../../../components/ui";

export default function VolumeDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const resolvedParams = use(params);
  const { data } = useApiQuery<VolumeDetail>(["volume", resolvedParams.name], `/volumes/${resolvedParams.name}`, 12_000);

  return (
    <div className="space-y-6">
      <PageHeader title={resolvedParams.name} description="Docker volume detail and raw inspect payload." />
      <Panel>
        <p><strong>Driver:</strong> {data?.driver ?? "—"}</p>
        <p><strong>Mountpoint:</strong> {data?.mountpoint ?? "—"}</p>
        <p><strong>Associated containers:</strong> {data?.associatedContainersCount ?? 0}</p>
      </Panel>
      <Panel>
        <div className="mb-3 flex justify-end"><CopyButton text={JSON.stringify(data?.inspect ?? {}, null, 2)} /></div>
        <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(data?.inspect ?? {}, null, 2)}</pre>
      </Panel>
    </div>
  );
}
