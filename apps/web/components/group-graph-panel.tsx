"use client";

import { useMemo } from "react";
import ReactFlow, { Background, Controls, MarkerType, MiniMap, type Edge, type Node, addEdge } from "reactflow";
import "reactflow/dist/style.css";
import type { GroupDetail } from "@dockforge/shared";
import { fetchJson, useApiMutation } from "../lib/api";
import { Panel } from "./ui";

export const GroupGraphPanel = ({ group }: { group: GroupDetail }) => {
  const saveLayout = useApiMutation<{ layouts: { groupContainerId: string; positionX: number; positionY: number }[] }, GroupDetail>({
    method: "POST",
    path: `/groups/${group.id}/layout`,
    invalidate: [["group", group.id]],
  });
  const createEdge = useApiMutation<{ fromGroupContainerId: string; toGroupContainerId: string }, unknown>({
    method: "POST",
    path: `/groups/${group.id}/edges`,
    invalidate: [["group", group.id]],
  });

  const nodes = useMemo<Node[]>(
    () =>
      group.containers.map((container) => {
        const layout = group.layouts.find((item) => item.groupContainerId === container.id);
        return {
          id: container.id,
          position: { x: layout?.positionX ?? 80, y: layout?.positionY ?? 80 },
          data: {
            label: `${container.aliasName || container.containerNameSnapshot}\n${container.runtimeState}`,
          },
          style: {
            borderRadius: 20,
            border: "1px solid #cbd5e1",
            padding: 10,
            background: container.runtimeHealth === "unhealthy" ? "#ffe4e6" : container.runtimeState === "running" ? "#dcfce7" : "#fff",
            width: 220,
          },
        };
      }),
    [group],
  );

  const edges = useMemo<Edge[]>(
    () =>
      group.edges.map((edge) => ({
        id: edge.id,
        source: edge.fromGroupContainerId,
        target: edge.toGroupContainerId,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    [group.edges],
  );

  return (
    <Panel className="h-[680px] p-0">
      <ReactFlow
        fitView
        nodes={nodes}
        edges={edges}
        onNodesChange={async (changes) => {
          const updatedLayouts = changes
            .filter(
              (
                change,
              ): change is typeof change & {
                id: string;
                position: { x: number; y: number };
              } => change.type === "position" && "position" in change && !!change.position,
            )
            .map((change) => ({
              groupContainerId: change.id,
              positionX: change.position.x,
              positionY: change.position.y,
            }));

          if (updatedLayouts.length) {
            await saveLayout.mutateAsync({ layouts: updatedLayouts });
          }
        }}
        onConnect={async (connection) => {
          if (connection.source && connection.target) {
            await createEdge.mutateAsync({
              fromGroupContainerId: connection.source,
              toGroupContainerId: connection.target,
            });
          }
        }}
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
    </Panel>
  );
};
