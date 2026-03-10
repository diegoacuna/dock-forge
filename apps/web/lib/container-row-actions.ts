export type PendingContainerAction = "start" | "stop" | "restart";

export const getPrimaryContainerAction = ({
  state,
  isRowPending,
  pendingAction,
}: {
  state: string;
  isRowPending: boolean;
  pendingAction: PendingContainerAction | null;
}) => {
  const isStopped = ["exited", "dead", "created"].includes(state);
  const isRestarting = state === "restarting";
  const action: "start" | "stop" = isStopped ? "start" : "stop";

  if (action === "start") {
    return {
      action,
      label: pendingAction === "start" ? "Starting..." : "Start",
      disabled: isRowPending || isRestarting,
    };
  }

  return {
    action,
    label: pendingAction === "stop" ? "Stopping..." : "Stop",
    disabled: isRowPending || isRestarting,
  };
};

export const getContainerOverflowMenuItems = (containerName: string) => [
  {
    key: "restart",
    label: "Restart",
  },
  {
    key: "terminal",
    label: "Open Terminal",
    href: `/containers/${containerName}?tab=Terminal`,
  },
] as const;
