"use client";

import { useState } from "react";
import type { ContainerSummary, Group } from "@dockforge/shared";
import { useApiMutation } from "../lib/api";
import { Button, Input, Panel, Select, TextArea } from "./ui";

export const CreateGroupForm = () => {
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
      <h3 className="text-lg font-semibold text-slate-950">Create group</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Input placeholder="Platform stack" value={name} onChange={(event) => setName(event.target.value)} />
        <Input placeholder="platform-stack" value={slug} onChange={(event) => setSlug(event.target.value)} />
        <TextArea
          className="md:col-span-2"
          rows={3}
          placeholder="Optional description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        <Button
          onClick={async () => {
            await mutation.mutateAsync({
              name,
              slug,
              description: description || null,
              color,
            });
            setName("");
            setSlug("");
            setDescription("");
          }}
        >
          Create
        </Button>
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

