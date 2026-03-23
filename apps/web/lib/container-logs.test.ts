import { describe, expect, it } from "vitest";
import type { ContainerLogEntry } from "@dockforge/shared";
import { appendLogEntry, findLogEntryMatchIndexes, getLogMessageMatchRanges, trimLogEntries } from "./container-logs";

const createEntry = (message: string): ContainerLogEntry => ({
  timestamp: "2026-03-07T12:00:00.000Z",
  stream: "stdout",
  message,
});

describe("container log helpers", () => {
  it("trims old entries from the front", () => {
    const entries = [createEntry("one"), createEntry("two"), createEntry("three")];

    expect(trimLogEntries(entries, 2).map((entry) => entry.message)).toEqual(["two", "three"]);
  });

  it("appends a new entry and keeps the bounded tail", () => {
    const entries = [createEntry("one"), createEntry("two")];

    expect(appendLogEntry(entries, createEntry("three"), 2).map((entry) => entry.message)).toEqual(["two", "three"]);
  });

  it("finds plain-text matches case-insensitively", () => {
    const entries = [createEntry("Server started"), createEntry("worker ready"), createEntry("SERVER healthy")];

    expect(findLogEntryMatchIndexes(entries, { query: "server" })).toEqual([0, 2]);
  });

  it("finds regex match ranges for highlighting", () => {
    expect(getLogMessageMatchRanges("error error", { query: "error", mode: "plain" })).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
  });
});
