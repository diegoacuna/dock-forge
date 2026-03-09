export const DASHBOARD_ONBOARDING_DISMISSED_KEY = "dockforge.dashboardOnboardingDismissed";

export type DashboardOnboardingStep = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
};

export const dashboardOnboardingSteps: DashboardOnboardingStep[] = [
  {
    id: "welcome",
    eyebrow: "Welcome",
    title: "Welcome to DockForge, your Docker control center",
    description:
      "DockForge helps you organize containers into app-managed groups, inspect what is running right now, and operate each container with logs, status, and terminal access from one place.",
    bullets: [
      "Use groups to model a stack the way your team thinks about it.",
      "Use container pages for runtime details, logs, and terminal access when you need to debug fast.",
    ],
  },
  {
    id: "groups",
    eyebrow: "Groups",
    title: "Groups turn loose containers into one manageable stack",
    description:
      "A group is where DockForge becomes useful. It lets you gather related containers, keep that membership in the app database, and run the stack as a unit instead of treating every container separately.",
    bullets: [
      "A container can belong to more than one group when that matches your workflow.",
      "Creating the first group gives you a dedicated place to attach containers and define startup behavior.",
    ],
  },
  {
    id: "containers",
    eyebrow: "Container Management",
    title: "You still keep direct control of every container",
    description:
      "DockForge does not hide Docker from you. You can inspect runtime state, open raw inspect data, review logs, and use terminal access or helper commands while still managing everything inside groups.",
    bullets: [
      "Use the Containers area when you need to inspect or troubleshoot an individual service.",
      "Use groups when you want to coordinate several containers together.",
    ],
  },
  {
    id: "launch",
    eyebrow: "First Action",
    title: "Next, create a group and attach the containers that belong together",
    description:
      "After you create the group, DockForge will take you directly to the attach step so you can add one container at a time or bulk-attach a whole folder before defining dependency order.",
    bullets: [
      "Create the group first so DockForge has a home for your stack.",
      "Then attach containers, then define graph edges and execution order.",
    ],
  },
];

export const shouldShowDashboardOnboarding = (totalGroups: number, dismissed: boolean) =>
  totalGroups === 0 && !dismissed;

export const getCreateGroupHref = (fromOnboarding: boolean) =>
  fromOnboarding ? "/groups/new?from=onboarding" : "/groups/new";

export const getPostCreateGroupHref = (groupId: string, fromOnboarding: boolean) =>
  fromOnboarding ? `/groups/${groupId}?onboarding=attach` : `/groups/${groupId}`;

export const getInitialGroupDetailTab = (onboardingParam: string | null) =>
  onboardingParam === "attach" ? "Containers" : "Overview";
