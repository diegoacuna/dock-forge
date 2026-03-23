import type { ContainerLogEntry, ContainerLogSearchMode } from "@dockforge/shared";

export type LogSearchOptions = {
  query: string;
  mode?: ContainerLogSearchMode;
  caseSensitive?: boolean;
};

export const trimLogEntries = (entries: ContainerLogEntry[], maxEntries: number) => {
  if (entries.length <= maxEntries) {
    return entries;
  }

  return entries.slice(entries.length - maxEntries);
};

export const appendLogEntry = (entries: ContainerLogEntry[], entry: ContainerLogEntry, maxEntries: number) =>
  trimLogEntries([...entries, entry], maxEntries);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const createLogSearchRegExp = ({ query, mode = "plain", caseSensitive = false }: LogSearchOptions) => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return null;
  }

  const source = mode === "regex" ? normalizedQuery : escapeRegExp(normalizedQuery);
  return new RegExp(source, caseSensitive ? "g" : "gi");
};

export const findLogEntryMatchIndexes = (entries: ContainerLogEntry[], options: LogSearchOptions) => {
  const pattern = createLogSearchRegExp(options);
  if (!pattern) {
    return [];
  }

  return entries.reduce<number[]>((indexes, entry, index) => {
    pattern.lastIndex = 0;
    if (pattern.test(entry.message)) {
      indexes.push(index);
    }

    return indexes;
  }, []);
};

export const getLogMessageMatchRanges = (message: string, options: LogSearchOptions) => {
  const pattern = createLogSearchRegExp(options);
  if (!pattern) {
    return [];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let match = pattern.exec(message);

  while (match) {
    if (match[0].length > 0) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    } else {
      pattern.lastIndex += 1;
    }

    match = pattern.exec(message);
  }

  return ranges;
};
