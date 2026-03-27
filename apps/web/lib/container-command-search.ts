import type { ContainerSummary, Group } from "@dockforge/shared";
import { shortenImageName } from "./utils";

type GroupDetailTab = "Overview" | "Containers" | "Execution Order" | "Graph" | "Run History";

export type ContainerCommandPaletteResult = {
  id: string;
  kind: "container";
  name: string;
  href: string;
  score: number;
  state: ContainerSummary["state"];
  imageLabel: string;
  projectLabel: string | null;
  groupLabel: string | null;
};

export type GroupCommandPaletteResult = {
  id: string;
  kind: "group";
  name: string;
  href: string;
  score: number;
  state: Group["groupStatus"];
  slugLabel: string;
  description: string | null;
  memberCount: number;
  dependencyCount: number;
};

export type GroupSectionCommandPaletteResult = {
  id: string;
  kind: "group-section";
  name: string;
  href: string;
  score: number;
  state: Group["groupStatus"];
  slugLabel: string;
  sectionLabel: GroupDetailTab;
  memberCount: number;
  dependencyCount: number;
};

export type CommandPaletteSearchResult =
  | ContainerCommandPaletteResult
  | GroupCommandPaletteResult
  | GroupSectionCommandPaletteResult;

const TAB_ALIASES: Record<string, GroupDetailTab> = {
  overview: "Overview",
  summary: "Overview",
  details: "Overview",
  containers: "Containers",
  services: "Containers",
  members: "Containers",
  graph: "Graph",
  dependency: "Graph",
  dependencies: "Graph",
  execution: "Execution Order",
  order: "Execution Order",
  stages: "Execution Order",
  runs: "Run History",
  history: "Run History",
  activity: "Run History",
};

const normalize = (value: string) => value.trim().toLowerCase();

const tokenize = (value: string) =>
  normalize(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const encodeTabHref = (groupId: string, tab: GroupDetailTab) => `/groups/${groupId}?tab=${encodeURIComponent(tab)}`;

const scoreContainer = (container: ContainerSummary, query: string) => {
  if (!query) {
    return 0;
  }

  let score = 0;
  const { name, containerKey, image, compose, groupNames } = container;

  if (name.toLowerCase() === query) {
    score += 120;
  } else if (name.toLowerCase().startsWith(query)) {
    score += 90;
  } else if (name.toLowerCase().includes(query)) {
    score += 70;
  }

  if (containerKey.toLowerCase() === query) {
    score += 80;
  } else if (containerKey.toLowerCase().startsWith(query)) {
    score += 55;
  } else if (containerKey.toLowerCase().includes(query)) {
    score += 35;
  }

  if (image.toLowerCase().includes(query)) {
    score += 20;
  }

  if ((compose.project ?? "").toLowerCase().includes(query)) {
    score += 16;
  }

  if (groupNames.some((groupName) => groupName.toLowerCase().includes(query))) {
    score += 12;
  }

  return score;
};

const scoreGroup = (group: Group, groupQuery: string) => {
  if (!groupQuery) {
    return 0;
  }

  let score = 0;
  const name = group.name.toLowerCase();
  const slug = group.slug.toLowerCase();
  const description = (group.description ?? "").toLowerCase();

  if (name === groupQuery) {
    score += 160;
  } else if (name.startsWith(groupQuery)) {
    score += 120;
  } else if (name.includes(groupQuery)) {
    score += 88;
  }

  if (slug === groupQuery) {
    score += 110;
  } else if (slug.startsWith(groupQuery)) {
    score += 80;
  } else if (slug.includes(groupQuery)) {
    score += 56;
  }

  if (description.includes(groupQuery)) {
    score += 20;
  }

  return score;
};

const getMatchedTabs = (tokens: string[]) => {
  const tabs = new Set<GroupDetailTab>();

  for (const token of tokens) {
    const tab = TAB_ALIASES[token];
    if (tab) {
      tabs.add(tab);
    }
  }

  return [...tabs];
};

export const searchCommandPalette = (
  containers: ContainerSummary[],
  groups: Group[],
  rawQuery: string,
  limit = 8,
): CommandPaletteSearchResult[] => {
  const query = normalize(rawQuery);

  if (!query) {
    return [...containers]
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, limit)
      .map((container) => ({
        id: container.id,
        kind: "container",
        name: container.name,
        href: `/containers/${encodeURIComponent(container.name)}`,
        state: container.state,
        imageLabel: shortenImageName(container.image),
        projectLabel: container.compose.project,
        groupLabel: container.groupNames[0] ?? null,
        score: 1,
      }));
  }

  const tokens = tokenize(query);
  const matchedTabs = getMatchedTabs(tokens);
  const groupQuery = tokens.filter((token) => !(token in TAB_ALIASES)).join(" ");

  const containerResults: CommandPaletteSearchResult[] = containers
    .map((container) => ({
      container,
      score: scoreContainer(container, query),
    }))
    .filter(({ score }) => score > 0)
    .map(({ container, score }) => ({
      id: container.id,
      kind: "container" as const,
      name: container.name,
      href: `/containers/${encodeURIComponent(container.name)}`,
      state: container.state,
      imageLabel: shortenImageName(container.image),
      projectLabel: container.compose.project,
      groupLabel: container.groupNames[0] ?? null,
      score,
    }));

  const groupResults: CommandPaletteSearchResult[] = groups.flatMap((group) => {
    const score = scoreGroup(group, groupQuery);
    if (score === 0) {
      return [];
    }

    const baseResult: GroupCommandPaletteResult = {
      id: `group:${group.id}`,
      kind: "group",
      name: group.name,
      href: `/groups/${group.id}`,
      state: group.groupStatus,
      slugLabel: group.slug,
      description: group.description,
      memberCount: group.memberCount,
      dependencyCount: group.dependencyCount,
      score,
    };

    const sectionResults = matchedTabs.map<GroupSectionCommandPaletteResult>((tab, index) => ({
      id: `group-section:${group.id}:${tab}`,
      kind: "group-section",
      name: group.name,
      href: encodeTabHref(group.id, tab),
      state: group.groupStatus,
      slugLabel: group.slug,
      sectionLabel: tab,
      memberCount: group.memberCount,
      dependencyCount: group.dependencyCount,
      score: score + 45 - index,
    }));

    return matchedTabs.length > 0 ? [...sectionResults, baseResult] : [baseResult];
  });

  return [...containerResults, ...groupResults]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.kind !== right.kind) {
        if (left.kind === "group-section") {
          return -1;
        }
        if (right.kind === "group-section") {
          return 1;
        }
        if (left.kind === "group") {
          return -1;
        }
        if (right.kind === "group") {
          return 1;
        }
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
};
