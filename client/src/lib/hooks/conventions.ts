/* hooks/conventions.ts — React Query hooks for the Conventions page: scan a repo
   for de-facto coding conventions, accept/reject/edit candidates, then assemble
   the accepted ones into a draft skill. Skill save reuses `useCreateSkill`. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionSkillDraft,
  ExtractResult,
  UpdateConventionBody,
} from "@devdigest/shared";

/** Persisted convention candidates for a repo (empty until the first scan). */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run a synchronous scan; persists survivors and returns the fresh batch. */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

/** Accept / reject a candidate, or edit its rule + category (sets `edited`). */
export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateConventionBody }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions"] }),
  });
}

/** Editable skill draft assembled from the accepted candidates. Lazy: only runs
    when `enabled` (i.e. the Create-skill modal is open). */
export function useConventionSkillDraft(repoId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["convention-skill-draft", repoId],
    queryFn: () => api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled: enabled && !!repoId,
    // The accepted set changes as the user accepts/rejects — always refetch on open.
    staleTime: 0,
    gcTime: 0,
  });
}
