import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, boolean, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  // Free-form grouping slug the extractor assigns (e.g. `async`, `error-handling`).
  category: text('category'),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  evidenceSnippet: text('evidence_snippet'),
  // Cited line range in `evidencePath` (nullable — model may omit it).
  evidenceStartLine: integer('evidence_start_line'),
  evidenceEndLine: integer('evidence_end_line'),
  confidence: doublePrecision('confidence'),
  // Review state. `status` is canonical; the old `accepted` boolean is kept
  // (unused, defaults false) only so the migration stays purely additive.
  accepted: boolean('accepted').notNull().default(false),
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
    .notNull()
    .default('pending'),
  // Set once the user hand-edits the rule text away from the model's proposal.
  edited: boolean('edited').notNull().default(false),
  createdAt: now(),
});
