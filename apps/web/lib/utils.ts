import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export const getFolderLabel = (workingDir: string | null | undefined) => {
  if (!workingDir) {
    return "Standalone";
  }

  const normalized = workingDir.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);

  return segments.at(-1) || "Standalone";
};

export const shortenImageName = (image: string, maxLength = 34) => {
  if (image.length <= maxLength) {
    return image;
  }

  const [namePart, tagPart] = image.split(":");
  const segments = namePart.split("/");
  const tail = segments.slice(-2).join("/");
  const suffix = tagPart ? `:${tagPart}` : "";
  const shortened = `${tail}${suffix}`;

  if (shortened.length <= maxLength) {
    return shortened;
  }

  return `${shortened.slice(0, maxLength - 1)}…`;
};
