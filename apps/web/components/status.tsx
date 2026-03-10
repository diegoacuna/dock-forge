import React from "react";
import { Badge } from "./ui";

export const StateBadge = ({ state, health }: { state?: string; health?: string | null }) => {
  if (health === "unhealthy") {
    return <Badge tone="danger">unhealthy</Badge>;
  }
  if (state === "error" || state === "failed") {
    return <Badge tone="danger">{state}</Badge>;
  }
  if (state === "degraded") {
    return <Badge tone="warning">degraded</Badge>;
  }
  if (state === "healthy" || state === "running" || state === "succeeded") {
    return <Badge tone="success">{state}</Badge>;
  }
  if (state === "restarting") {
    return <Badge tone="accent">restarting</Badge>;
  }
  if (state === "pending") {
    return <Badge tone="accent">pending</Badge>;
  }
  return <Badge>{state ?? "unknown"}</Badge>;
};
