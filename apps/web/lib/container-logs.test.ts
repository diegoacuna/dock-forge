import { describe, expect, it } from "vitest";
import type { ContainerLogEntry } from "@dockforge/shared";
import { appendLogEntry, trimLogEntries } from "./container-logs";

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
});
