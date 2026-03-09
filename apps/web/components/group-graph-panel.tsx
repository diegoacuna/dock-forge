"use client";

import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, MiniMap, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { GroupDetail } from "@dockforge/shared";
import { Panel } from "./ui";

export const GroupGraphPanel = ({ group }: { group: GroupDetail }) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const containersByFolder = useMemo(
    () =>
      group.containers.reduce<Map<string, typeof group.containers>>((accumulator, container) => {
        const current = accumulator.get(container.folderLabelSnapshot) ?? [];
        current.push(container);
        accumulator.set(container.folderLabelSnapshot, current);
        return accumulator;
      }, new Map()),
    [group.containers],
  );

  const stageGapX = 340;
  const folderGapY = 220;

  const nodes = useMemo<Node[]>(() => {
    return group.executionStages.flatMap((stage, stageIndex) =>
      stage.folders.map((folder, folderIndex) => {
        const containers = [...(containersByFolder.get(folder.folderLabel) ?? [])].sort((left, right) =>
          (left.aliasName || left.containerNameSnapshot).localeCompare(right.aliasName || right.containerNameSnapshot),
        );
        const expanded = !!expandedFolders[folder.folderLabel];

        return {
          id: `folder:${folder.folderLabel}`,
          position: { x: 60 + stageIndex * stageGapX, y: 80 + folderIndex * folderGapY },
          data: {
            label: (
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Stage {stage.stage + 1}</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">{folder.folderLabel}</h3>
                  <p className="mt-1 text-sm text-slate-600">{folder.containerCount} containers</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedFolders((current) => ({
                      ...current,
                      [folder.folderLabel]: !current[folder.folderLabel],
                    }))
                  }
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  {expanded ? "Hide containers" : "Show containers"}
                </button>
                {expanded ? (
                  <div className="space-y-2 rounded-2xl bg-white/80 p-3">
                    {containers.map((container) => (
                      <div key={container.id} className="rounded-xl border border-slate-200 px-3 py-2 text-left">
                        <p className="font-medium text-slate-900">{container.aliasName || container.containerNameSnapshot}</p>
                        <p className="mt-1 text-xs text-slate-500">{container.runtimeState}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ),
          },
          draggable: false,
          selectable: false,
          style: {
            width: 260,
            borderRadius: 24,
            border: "1px solid #cbd5e1",
            padding: 16,
            background: "#f8fafc",
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.06)",
          },
        } satisfies Node;
      }),
    );
  }, [containersByFolder, expandedFolders, group.executionStages]);

  const edges = useMemo<Edge[]>(
    () =>
      group.executionStages.flatMap((stage, stageIndex) => {
        const currentFolders = stage.folders.map((folder) => folder.folderLabel);
        const nextFolders = group.executionStages[stageIndex + 1]?.folders.map((folder) => folder.folderLabel) ?? [];

        return currentFolders.flatMap((currentFolder) =>
          nextFolders.map((nextFolder) => ({
            id: `folder:${currentFolder}->folder:${nextFolder}`,
            source: `folder:${currentFolder}`,
            target: `folder:${nextFolder}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: false,
          })),
        );
      }),
    [group.executionStages],
  );

  return (
    <Panel className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Execution Graph</h2>
        <p className="mt-2 text-sm text-slate-600">
          Read-only visualization of folder-to-folder execution flow. Expand a folder node to inspect its containers; all arrows stay at the folder level.
        </p>
      </div>
      <div className="h-[680px] rounded-3xl border border-slate-200">
        <ReactFlow
          fitView
          nodes={nodes}
          edges={edges}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </div>
    </Panel>
  );
};
