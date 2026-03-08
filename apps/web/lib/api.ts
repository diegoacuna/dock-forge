"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export const buildApiUrl = (path: string) => `${API_BASE}${path}`;

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const useApiQuery = <T,>(key: unknown[], path: string, refetchInterval?: number) =>
  useQuery({
    queryKey: key,
    queryFn: () => fetchJson<T>(path),
    refetchInterval,
  });

export const useApiMutation = <TBody, TResult>(options: {
  method: "POST" | "PATCH" | "DELETE";
  path: string | ((body: TBody) => string);
  invalidate?: unknown[][];
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: TBody) => {
      const path = typeof options.path === "function" ? options.path(body) : options.path;
      return fetchJson<TResult>(path, {
        method: options.method,
        body: options.method === "DELETE" ? undefined : JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      await Promise.all((options.invalidate ?? []).map((key) => queryClient.invalidateQueries({ queryKey: key })));
    },
  });
};
