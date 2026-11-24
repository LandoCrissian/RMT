"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectUpdate } from "@/lib/project-updates";
import type { StudioSession } from "./studio-shared";

type UpdatePage = { updates: ProjectUpdate[]; nextCursor: string | null; hasMore: boolean };
type UpdateState = UpdatePage & { key: string; loading: boolean; error: string; ready: boolean; accountChanged: boolean };

export class UpdateRequestError extends Error {
  constructor(message: string, readonly uncertain = false, readonly accountChanged = false) { super(message); }
}

function isUpdate(value: unknown): value is ProjectUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ["id", "projectId", "projectName", "title", "body", "linkLabel", "linkUrl", "reviewNote"].every(key => typeof row[key] === "string")
    && ["announcement", "progress", "release"].includes(String(row.kind))
    && ["draft", "pending", "approved", "rejected", "archived"].includes(String(row.status))
    && Number.isSafeInteger(row.revision) && Number(row.revision) > 0
    && typeof row.canManage === "boolean" && typeof row.createdAt === "number" && typeof row.updatedAt === "number"
    && (row.publishedAt === null || typeof row.publishedAt === "number");
}

async function responseData(response: Response): Promise<Record<string, unknown>> {
  const accessChanged = response.status === 401 || response.status === 403;
  let data: Record<string, unknown>;
  try { data = await response.json(); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid response"); }
  catch { throw new UpdateRequestError(accessChanged ? "Your account or access changed. Refresh RMT before continuing." : "We couldn’t confirm the response. Refresh updates to check what was saved.", !accessChanged, accessChanged); }
  if (!response.ok) throw new UpdateRequestError(typeof data.error === "string" ? data.error : "Your updates could not be reached. Please try again.", response.status >= 500, data.code === "account_changed" || accessChanged);
  return data;
}

export function useProjectUpdates(session: StudioSession, options: { projectId?: string; review?: boolean } = {}) {
  const userId = session.authenticated ? session.userId : null;
  const { projectId, review = false } = options;
  const key = `${userId ?? "guest"}:${review ? "review" : projectId ?? "all"}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const mutationBusy = useRef(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<UpdateState>({ key, updates: [], nextCursor: null, hasMore: false, loading: true, error: "", ready: false, accountChanged: false });
  const endpoint = review ? "/api/admin/project-updates" : "/api/project-updates";
  const matches = state.key === key;

  const load = useCallback(async (cursor?: string | null) => {
    if (!userId || (review && !session.isAdmin) || mutationBusy.current) return;
    const requestSequence = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ ...(previous.key === key ? previous : { key, updates: [], nextCursor: null, hasMore: false }), loading: true, ready: false, error: "", accountChanged: false }));
    const query = new URLSearchParams();
    if (projectId) query.set("projectId", projectId);
    if (cursor) query.set("cursor", cursor);
    try {
      const data = await responseData(await fetch(`${endpoint}${query.size ? `?${query}` : ""}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { "X-RMT-Account": userId } }));
      if (!Array.isArray(data.updates) || !data.updates.every(isUpdate) || typeof data.hasMore !== "boolean"
          || (data.nextCursor !== null && typeof data.nextCursor !== "string") || data.hasMore !== Boolean(data.nextCursor)
          || (projectId && data.updates.some(row => row.projectId !== projectId))) {
        throw new UpdateRequestError("The updates response was incomplete. Refresh to try again.");
      }
      if (controller.signal.aborted || currentKey.current !== key || sequence.current !== requestSequence) return;
      const page = data as unknown as UpdatePage;
      setState(previous => {
        const existing = cursor && previous.key === key ? previous.updates : [];
        const rows = new Map(existing.map(row => [row.id, row]));
        for (const row of page.updates) rows.set(row.id, row);
        return { key, updates: [...rows.values()], nextCursor: page.nextCursor, hasMore: page.hasMore, loading: false, error: "", ready: true, accountChanged: false };
      });
    } catch (cause) {
      if (controller.signal.aborted || currentKey.current !== key || sequence.current !== requestSequence) return;
      const accountChanged = cause instanceof UpdateRequestError && cause.accountChanged;
      setState(previous => ({ ...previous, key, loading: false, error: cause instanceof Error ? cause.message : "Your updates could not be loaded.", accountChanged,
        ...(accountChanged ? { updates: [], nextCursor: null, hasMore: false, ready: false } : {}) }));
    }
  }, [endpoint, key, projectId, review, session.isAdmin, userId]);

  useEffect(() => {
    request.current?.abort();
    sequence.current++;
    mutationBusy.current = false;
    setBusy(false);
    setState({ key, updates: [], nextCursor: null, hasMore: false, loading: true, error: "", ready: false, accountChanged: false });
    void load();
    return () => { request.current?.abort(); sequence.current++; };
  }, [key, load]);

  async function mutate(id: string | null, body: object): Promise<ProjectUpdate | null> {
    if (!userId || mutationBusy.current || !matches || !state.ready || state.loading) return null;
    const requestSequence = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    mutationBusy.current = true;
    setBusy(true);
    try {
      const data = await responseData(await fetch(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, {
        method: review || !id ? "POST" : "PATCH", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-RMT-Account": userId }, body: JSON.stringify(body),
      }));
      if (!isUpdate(data.update) || (id && data.update.id !== id) || (projectId && data.update.projectId !== projectId)) throw new UpdateRequestError("We couldn’t confirm your change. Refresh updates to check what was saved.", true);
      if (controller.signal.aborted || currentKey.current !== key || sequence.current !== requestSequence) return null;
      const update = data.update;
      setState(previous => ({ ...previous, updates: [update, ...previous.updates.filter(row => row.id !== update.id)], error: "" }));
      return update;
    } catch (cause) {
      if (controller.signal.aborted || currentKey.current !== key || sequence.current !== requestSequence) return null;
      if (cause instanceof UpdateRequestError) {
        if (cause.accountChanged) setState({ key, updates: [], nextCursor: null, hasMore: false, loading: false, error: cause.message, ready: false, accountChanged: true });
        throw cause;
      }
      throw new UpdateRequestError("The connection was interrupted. Refresh updates to check whether your change was saved.", true);
    } finally {
      if (currentKey.current === key && sequence.current === requestSequence) { mutationBusy.current = false; setBusy(false); }
    }
  }

  return {
    updates: matches ? state.updates : [], nextCursor: matches ? state.nextCursor : null,
    hasMore: matches && state.hasMore, loading: !matches || state.loading, ready: matches && state.ready,
    error: matches ? state.error : "", accountChanged: matches && state.accountChanged,
    busy, refresh: () => load(), loadMore: () => load(matches ? state.nextCursor : null), mutate,
  };
}
