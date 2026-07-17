/* hooks/blast.ts — Blast Radius: symbols → downstream callers → affected
   endpoints/crons, read off the repo-intel index (GET /pulls/:id/blast).
   No LLM call by default; `?explain=true` is opt-in and adds one cheap-model
   paragraph, cached under its own query key so toggling it never refetches
   the (already-cached) non-explain read on the way back. */
"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastResponse } from "@devdigest/shared";

export interface UseBlastOptions {
  /** Opt-in LLM summary paragraph — omit/false for the zero-token default read. */
  explain?: boolean;
}

export function useBlast(prId: string | null | undefined, options: UseBlastOptions = {}) {
  const explain = options.explain ?? false;
  return useQuery({
    queryKey: ["blast", prId, explain],
    queryFn: () =>
      api.get<BlastResponse>(`/pulls/${prId}/blast${explain ? "?explain=true" : ""}`),
    enabled: !!prId,
    // Toggling `explain` switches to a different query key (the explanation
    // is opt-in and cached separately) — keep showing the last map instead
    // of flashing back to the loading skeleton while it resolves.
    placeholderData: keepPreviousData,
  });
}
