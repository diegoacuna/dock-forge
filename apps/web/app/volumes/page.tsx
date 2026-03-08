"use client";

import Link from "next/link";
import type { VolumeSummary } from "@dockforge/shared";
import { useApiQuery } from "../../lib/api";
import { PageHeader, Panel, Table } from "../../components/ui";

export default function VolumesPage() {
  const { data } = useApiQuery<VolumeSummary[]>(["volumes"], "/volumes", 12_000);

  return (
    <div className="space-y-6">
      <PageHeader title="Volumes" description="Inspect Docker volumes, drivers, mountpoints, and connected containers." />
      <Panel>
        <Table>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Mountpoint</th>
              <th className="px-3 py-2">Associated containers</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((volume) => (
              <tr key={volume.name} className="bg-slate-50">
                <td className="px-3 py-4"><Link href={`/volumes/${volume.name}`} className="font-medium text-slate-950">{volume.name}</Link></td>
                <td className="px-3 py-4">{volume.driver ?? "—"}</td>
                <td className="px-3 py-4">{volume.mountpoint ?? "—"}</td>
                <td className="px-3 py-4">{volume.associatedContainersCount}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

