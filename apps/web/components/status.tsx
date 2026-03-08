import { Badge } from "./ui";

export const StateBadge = ({ state, health }: { state?: string; health?: string | null }) => {
  if (health === "unhealthy") {
    return <Badge tone="danger">unhealthy</Badge>;
  }
  if (state === "running") {
    return <Badge tone="success">running</Badge>;
  }
  if (state === "restarting") {
    return <Badge tone="accent">restarting</Badge>;
  }
  return <Badge>{state ?? "unknown"}</Badge>;
};

