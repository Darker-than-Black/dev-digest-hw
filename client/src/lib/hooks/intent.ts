/* hooks/intent.ts — React Query hooks for the per-PR Intent card: fetch the
   derived {intent, in_scope[], out_of_scope[]} (null pre-first-compute) and
   trigger a manual recompute. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

/** Persisted intent for a PR — `null` before the first compute (auto or manual). */
export function usePrIntent(prId: string | null) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: prId != null,
  });
}

/** Force re-derivation of a PR's intent; refreshes `usePrIntent` on success. */
export function useRecomputeIntent(prId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent/recompute`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-intent", prId] }),
  });
}
