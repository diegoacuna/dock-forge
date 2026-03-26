export type PendingContainerAction = "start" | "stop" | "restart";

const STOPPED_STATES = new Set(["exited", "dead", "created"]);

const isStoppedState = (state: string) => STOPPED_STATES.has(state);
const isRestartingState = (state: string) => state === "restarting";

export const getPrimaryContainerAction = ({
  state,
  isRowPending,
  pendingAction,
}: {
  state: string;
  isRowPending: boolean;
  pendingAction: PendingContainerAction | null;
}) => {
  const isStopped = isStoppedState(state);
  const isRestarting = isRestartingState(state);
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

export const getContainerDetailActions = ({
  state,
  isActionPending,
  pendingAction,
}: {
  state: string;
  isActionPending: boolean;
  pendingAction: PendingContainerAction | null;
}) => {
  if (isRestartingState(state)) {
    return [
      {
        action: "restart" as const,
        label: "Restarting...",
        disabled: true,
        variant: "warning" as const,
      },
    ];
  }

  if (isStoppedState(state)) {
    return [
      {
        action: "start" as const,
        label: pendingAction === "start" ? "Starting..." : "Start",
        disabled: isActionPending,
        variant: "success" as const,
      },
    ];
  }

  return [
    {
      action: "stop" as const,
      label: pendingAction === "stop" ? "Stopping..." : "Stop",
      disabled: isActionPending,
      variant: "danger" as const,
    },
    {
      action: "restart" as const,
      label: pendingAction === "restart" ? "Restarting..." : "Restart",
      disabled: isActionPending,
      variant: "ghost" as const,
    },
  ];
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
