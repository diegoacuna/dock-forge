import type { ContainerLogEntry } from "@dockforge/shared";

export const trimLogEntries = (entries: ContainerLogEntry[], maxEntries: number) => {
  if (entries.length <= maxEntries) {
    return entries;
  }

  return entries.slice(entries.length - maxEntries);
};

export const appendLogEntry = (entries: ContainerLogEntry[], entry: ContainerLogEntry, maxEntries: number) =>
  trimLogEntries([...entries, entry], maxEntries);
