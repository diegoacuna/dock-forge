"use client";

import Link from "next/link";
import type { NetworkSummary } from "@dockforge/shared";
import { useApiQuery } from "../../lib/api";
import { PageHeader, Panel, Table } from "../../components/ui";

export default function NetworksPage() {
  const { data } = useApiQuery<NetworkSummary[]>(["networks"], "/networks", 12_000);

  return (
    <div className="space-y-6">
      <PageHeader title="Networks" description="Inspect Docker networks, connected containers, addressing, and raw inspect payloads." />
      <Panel>
        <Table>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Subnet / gateway</th>
              <th className="px-3 py-2">Containers</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((network) => (
              <tr key={network.id} className="bg-slate-50">
                <td className="px-3 py-4"><Link href={`/networks/${network.id}`} className="font-medium text-slate-950">{network.name}</Link></td>
                <td className="px-3 py-4">{network.driver ?? "—"}</td>
                <td className="px-3 py-4">{network.scope ?? "—"}</td>
                <td className="px-3 py-4">{network.subnet ?? "—"} / {network.gateway ?? "—"}</td>
                <td className="px-3 py-4">{network.connectedContainersCount}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

