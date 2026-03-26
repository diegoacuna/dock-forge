import type { ContainerSummary } from "@dockforge/shared";
import { shortenImageName } from "./utils";

export type ContainerCommandSearchResult = {
  id: string;
  name: string;
  href: string;
  state: ContainerSummary["state"];
  imageLabel: string;
  projectLabel: string | null;
  groupLabel: string | null;
  score: number;
};

const normalize = (value: string) => value.trim().toLowerCase();

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

export const searchContainersForCommandPalette = (
  containers: ContainerSummary[],
  rawQuery: string,
  limit = 8,
): ContainerCommandSearchResult[] => {
  const query = normalize(rawQuery);
  const scored = containers
    .map((container) => ({
      container,
      score: query ? scoreContainer(container, query) : 1,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.container.name.localeCompare(right.container.name);
    })
    .slice(0, limit);

  return scored.map(({ container, score }) => ({
    id: container.id,
    name: container.name,
    href: `/containers/${encodeURIComponent(container.name)}`,
    state: container.state,
    imageLabel: shortenImageName(container.image),
    projectLabel: container.compose.project,
    groupLabel: container.groupNames[0] ?? null,
    score,
  }));
};
