"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ContainerSummary, Group } from "@dockforge/shared";
import { useApiMutation } from "../lib/api";
import { Button, Input, Panel, Select, TextArea } from "./ui";

export const CreateGroupForm = () => {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#f97316");

  const mutation = useApiMutation<
    { name: string; slug: string; description: string | null; color: string | null },
    Group
  >({
    method: "POST",
    path: "/groups",
    invalidate: [["groups"], ["dashboard"]],
  });

  return (
    <Panel>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Create group</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Groups are app-managed orchestration units for organizing containers and defining group-specific
            dependency order.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900">Name</span>
            <p className="text-sm text-slate-500">Human-readable label shown throughout the UI.</p>
            <Input placeholder="Platform stack" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900">Slug</span>
            <p className="text-sm text-slate-500">Stable identifier used in URLs and internal references.</p>
            <Input placeholder="platform-stack" value={slug} onChange={(event) => setSlug(event.target.value)} />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-slate-900">Description</span>
            <p className="text-sm text-slate-500">Optional context about the stack, ownership, or orchestration purpose.</p>
            <TextArea
              rows={4}
              placeholder="Optional description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-900">Color</span>
            <p className="text-sm text-slate-500">Visual accent used to identify the group in the UI.</p>
            <div className="flex items-center gap-3">
              <label
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 shadow-sm transition hover:border-orange-300"
                style={{ backgroundColor: color }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-full w-full cursor-pointer opacity-0"
                  aria-label="Group color"
                />
              </label>
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium uppercase tracking-[0.12em] text-slate-700">
                {color}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={mutation.isPending}
            onClick={async () => {
              const group = await mutation.mutateAsync({
                name,
                slug,
                description: description || null,
                color,
              });
              router.push(`/groups/${group.id}`);
            }}
          >
            {mutation.isPending ? "Creating..." : "Create group"}
          </Button>
        </div>
      </div>
    </Panel>
  );
};

export const AddGroupContainerForm = ({
  groupId,
  containers,
}: {
  groupId: string;
  containers: ContainerSummary[];
}) => {
  const [containerKey, setContainerKey] = useState(containers[0]?.containerKey ?? "");
  const mutation = useApiMutation<
    { containerKey: string; containerNameSnapshot: string; lastResolvedDockerId: string | null },
    unknown
  >({
    method: "POST",
    path: `/groups/${groupId}/containers`,
    invalidate: [["group", groupId], ["groups"], ["containers"], ["dashboard"]],
  });

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <Select value={containerKey} onChange={(event) => setContainerKey(event.target.value)}>
        {containers.map((container) => (
          <option key={container.id} value={container.containerKey}>
            {container.name}
          </option>
        ))}
      </Select>
      <Button
        onClick={async () => {
          const selected = containers.find((container) => container.containerKey === containerKey);
          if (!selected) return;
          await mutation.mutateAsync({
            containerKey: selected.containerKey,
            containerNameSnapshot: selected.name,
            lastResolvedDockerId: selected.id,
          });
        }}
      >
        Add to group
      </Button>
    </div>
  );
};
