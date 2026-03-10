export const resolveInstallRedirect = ({
  pathname,
  installCompleted,
}: {
  pathname: string;
  installCompleted: boolean;
}) => {
  if (!installCompleted && pathname !== "/install") {
    return "/install";
  }

  if (installCompleted && pathname === "/install") {
    return "/";
  }

  return null;
};
