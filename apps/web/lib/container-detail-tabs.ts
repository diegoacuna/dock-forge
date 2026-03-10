export const CONTAINER_DETAIL_TABS = [
  "Overview",
  "Environment",
  "Mounts / Volumes",
  "Networks",
  "Compose metadata",
  "Raw inspect",
  "Terminal",
] as const;

export const resolveContainerDetailTab = (requestedTab: string | null) =>
  requestedTab && CONTAINER_DETAIL_TABS.includes(requestedTab as (typeof CONTAINER_DETAIL_TABS)[number]) ? requestedTab : "Overview";
