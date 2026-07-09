import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionStatus } from '@devdigest/shared';

/**
 * L02 — conventions data-access. The ONLY layer touching the DB for the
 * conventions domain (`conventions` table). Workspace-scoped on every query.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;

/** One survivor of the evidence gate, ready to persist as a `pending` candidate. */
export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  category: string;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceStartLine?: number | null;
  evidenceEndLine?: number | null;
  confidence: number;
}

/** Accept/reject and/or edit; `edited` is set by the service when `rule` changes. */
export interface UpdateConvention {
  status?: ConventionStatus;
  rule?: string;
  category?: string;
  edited?: boolean;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Persist the gated candidates (all `status:'pending'`). Returns the rows. */
  async insertCandidates(values: InsertConvention[]): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        values.map((v) => ({
          workspaceId: v.workspaceId,
          repoId: v.repoId,
          category: v.category,
          rule: v.rule,
          evidencePath: v.evidencePath,
          evidenceSnippet: v.evidenceSnippet,
          evidenceStartLine: v.evidenceStartLine ?? null,
          evidenceEndLine: v.evidenceEndLine ?? null,
          confidence: v.confidence,
          status: 'pending' as const,
        })),
      )
      .returning();
  }

  /** All persisted candidates for a repo (newest first), workspace-scoped. */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /** Update status and/or rule+category for one candidate. Workspace-scoped. */
  async updateOne(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.edited !== undefined ? { edited: patch.edited } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Accepted candidates for a repo (newest first) — the skill-draft source. */
  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .orderBy(desc(t.conventions.createdAt));
  }
}
