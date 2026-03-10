"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CopyButton, Table } from "./ui";
import { StateBadge } from "./status";
import { shortenImageName } from "../lib/utils";
import type { GroupedContainersSection, GroupedContainerRow } from "../lib/grouped-containers";

type RenderContext = {
  row: GroupedContainerRow;
  folderLabel: string;
};

export const GroupedContainersTable = ({
  sections,
  emptyState,
  renderActions,
  renderExpandedContent,
  getRowHref,
}: {
  sections: GroupedContainersSection[];
  emptyState: ReactNode;
  renderActions: (context: RenderContext) => ReactNode;
  renderExpandedContent?: (context: RenderContext) => ReactNode;
  getRowHref?: (row: GroupedContainerRow) => string | null;
}) => {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedFolders((current) => {
      const next = { ...current };
      const validFolders = new Set(sections.map((section) => section.folderLabel));

      for (const key of Object.keys(next)) {
        if (!validFolders.has(key)) {
          delete next[key];
        }
      }

      return next;
    });
  }, [sections]);

  const toggleFolder = (folderLabel: string) => {
    setCollapsedFolders((current) => ({
      ...current,
      [folderLabel]: !current[folderLabel],
    }));
  };

  if (sections.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <Table>
      <thead>
        <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
          <th className="px-3 py-2">Name</th>
          <th className="px-3 py-2">State</th>
          <th className="px-3 py-2">Ports</th>
          <th className="px-3 py-2">Groups</th>
          <th className="px-3 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((section) => (
          <FolderSectionRows
            key={section.folderLabel}
            section={section}
            isCollapsed={!!collapsedFolders[section.folderLabel]}
            onToggle={() => toggleFolder(section.folderLabel)}
            renderActions={renderActions}
            renderExpandedContent={renderExpandedContent}
            getRowHref={getRowHref}
          />
        ))}
      </tbody>
    </Table>
  );
};

const FolderSectionRows = ({
  section,
  isCollapsed,
  onToggle,
  renderActions,
  renderExpandedContent,
  getRowHref,
}: {
  section: GroupedContainersSection;
  isCollapsed: boolean;
  onToggle: () => void;
  renderActions: (context: RenderContext) => ReactNode;
  renderExpandedContent?: (context: RenderContext) => ReactNode;
  getRowHref?: (row: GroupedContainerRow) => string | null;
}) => (
  <>
    <tr className="bg-transparent">
      <td colSpan={5} className="px-3 pb-2 pt-5">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between border-b border-slate-200 pb-2 text-left"
        >
          <div className="flex items-center gap-2">
            {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
            <div>
              <p className="text-sm font-semibold text-slate-900">{section.folderLabel}</p>
              <p className="text-xs text-slate-500">
                {section.containers.length} container{section.containers.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </button>
      </td>
    </tr>
    {!isCollapsed &&
      section.containers.map((row) => (
        <ContainerRowFragment
          key={row.id}
          row={row}
          folderLabel={section.folderLabel}
          renderActions={renderActions}
          renderExpandedContent={renderExpandedContent}
          getRowHref={getRowHref}
        />
      ))}
  </>
);

const ContainerRowFragment = ({
  row,
  folderLabel,
  renderActions,
  renderExpandedContent,
  getRowHref,
}: {
  row: GroupedContainerRow;
  folderLabel: string;
  renderActions: (context: RenderContext) => ReactNode;
  renderExpandedContent?: (context: RenderContext) => ReactNode;
  getRowHref?: (row: GroupedContainerRow) => string | null;
}) => {
  const expandedContent = renderExpandedContent?.({ row, folderLabel });
  const href = getRowHref?.(row) ?? null;
  const canCopyImage = row.image !== "Runtime unavailable";
  const nameContent = href ? (
    <Link href={href} className="font-medium text-slate-950">
      {row.name}
    </Link>
  ) : (
    <p className="font-medium text-slate-950">{row.name}</p>
  );

  return (
    <>
      <tr className="rounded-2xl bg-slate-50">
        <td className="px-3 py-4">
          {nameContent}
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span title={row.image} className="truncate">
              {shortenImageName(row.image)}
            </span>
            {canCopyImage ? <CopyButton text={row.image} label="Copy image URI" iconOnly /> : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">{row.projectLabel}</p>
        </td>
        <td className="px-3 py-4">
          <StateBadge state={row.state} health={row.health} />
        </td>
        <td className="px-3 py-4 text-slate-700">{row.ports.join(", ") || "—"}</td>
        <td className="px-3 py-4 text-slate-700">{row.groupNames.join(", ") || "—"}</td>
        <td className="px-3 py-4">{renderActions({ row, folderLabel })}</td>
      </tr>
      {expandedContent ? (
        <tr className="bg-white">
          <td colSpan={5} className="px-3 pb-4">
            {expandedContent}
          </td>
        </tr>
      ) : null}
    </>
  );
};
