"use client";

import Link from "next/link";
import type { Group } from "@dockforge/shared";
import { useApiMutation, useApiQuery } from "../../lib/api";
import { CreateGroupForm } from "../../components/forms";
import { PageHeader, Panel, Table, Button } from "../../components/ui";
import { StateBadge } from "../../components/status";

export default function GroupsPage() {
  const { data } = useApiQuery<Group[]>(["groups"], "/groups", 8_000);
  const deleteMutation = useApiMutation<Record<string, never>, unknown>({
    method: "DELETE",
    path: () => "/groups/invalid",
    invalidate: [["groups"], ["dashboard"]],
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Groups" description="App-managed orchestration groups with shared containers and group-specific dependency DAGs." />
      <CreateGroupForm />
      <Panel>
        <Table>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Members</th>
              <th className="px-3 py-2">Dependencies</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((group) => (
              <tr key={group.id} className="bg-slate-50">
                <td className="px-3 py-4">
                  <Link href={`/groups/${group.id}`} className="font-medium text-slate-950">{group.name}</Link>
                  <p className="text-xs text-slate-500">{group.slug}</p>
                </td>
                <td className="px-3 py-4">{group.memberCount}</td>
                <td className="px-3 py-4">{group.dependencyCount}</td>
                <td className="px-3 py-4"><StateBadge state={group.lastRunStatus?.toLowerCase()} /></td>
                <td className="px-3 py-4">
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"}/groups/${group.id}`, { method: "DELETE" });
                      window.location.reload();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

