import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { ExtractionResponse } from '../src/modules/conventions/prompt.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A real config file the evidence gate can read from the clone dir. */
const TSCONFIG_SRC = [
  '{',
  '  "compilerOptions": {',
  '    "strict": true,',
  '    "module": "ESNext",',
  '    "target": "ES2022"',
  '  }',
  '}',
].join('\n');

/** A real source file the evidence gate re-reads for a non-sample citation. */
const FOO_SRC = [
  'export async function loadUser(id) {', // 1
  '  try {', //                              2
  '    return await db.find(id);', //        3
  '  } catch (err) {', //                    4
  "    throw new AppError('nope', err);", // 5
  '  }', //                                  6
  '}', //                                    7
].join('\n');

/**
 * Three LLM proposals: two grounded in the seeded files (tsconfig line 3, foo
 * line 5) and ONE bogus whose snippet appears nowhere → the evidence gate must
 * drop exactly the bogus one, persisting 2.
 */
const EXTRACTION_FIXTURE: ExtractionResponse = {
  candidates: [
    {
      category: 'typescript',
      rule: 'Enable strict mode in tsconfig',
      evidence_path: 'tsconfig.json',
      evidence_snippet: '"strict": true',
      evidence_start_line: 3,
      evidence_end_line: 3,
      confidence: 0.95,
    },
    {
      category: 'error-handling',
      rule: 'Rethrow caught errors as AppError',
      evidence_path: 'src/foo.ts',
      evidence_snippet: "throw new AppError('nope', err);",
      evidence_start_line: 5,
      evidence_end_line: 5,
      confidence: 0.9,
    },
    {
      category: 'imports',
      rule: 'A hallucinated rule with no grounding',
      evidence_path: 'src/foo.ts',
      evidence_snippet: 'const totallyBogusNeverAppears = 99999;',
      evidence_start_line: 42,
      evidence_end_line: 42,
      confidence: 0.4,
    },
  ],
};

d('L02 conventions extractor (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneDir: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    // A real on-disk clone so repoIntel.readFiles can back the evidence gate.
    cloneDir = await mkdtemp(join(tmpdir(), 'conv-clone-'));
    await writeFile(join(cloneDir, 'tsconfig.json'), TSCONFIG_SRC, 'utf8');
    await mkdir(join(cloneDir, 'src'), { recursive: true });
    await writeFile(join(cloneDir, 'src', 'foo.ts'), FOO_SRC, 'utf8');
  });

  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  function appWith(structured: unknown) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        llm: {
          openai: new MockLLMProvider('openai', { structured }),
        },
      },
    });
  }

  let repoSeq = 0;
  async function seedRepo() {
    const name = `conv-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: cloneDir,
      })
      .returning();
    return repo!;
  }

  it('extract → evidence gate → accept → skill-draft → create skill → link to agent', async () => {
    const app = await appWith(EXTRACTION_FIXTURE);
    const repo = await seedRepo();

    // 1. Extract: the bogus (ungrounded) proposal is dropped; 2 survive.
    const extractRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/extract`,
    });
    expect(extractRes.statusCode).toBe(200);
    const extract = extractRes.json();
    expect(extract.candidates).toHaveLength(2);
    expect(extract.scanned_files).toBeGreaterThan(0);
    for (const c of extract.candidates) {
      expect(c.status).toBe('pending');
    }
    const rules = extract.candidates.map((c: { rule: string }) => c.rule).sort();
    expect(rules).toEqual(['Enable strict mode in tsconfig', 'Rethrow caught errors as AppError']);

    // 2. List: the same 2 persisted candidates come back.
    const listRes = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(listRes.statusCode).toBe(200);
    const listed = listRes.json();
    expect(listed).toHaveLength(2);

    // 3. Accept both via PATCH.
    for (const c of listed) {
      const patched = await app.inject({
        method: 'PATCH',
        url: `/conventions/${c.id}`,
        payload: { status: 'accepted' },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().status).toBe('accepted');
    }

    // 4. Skill-draft merges BOTH accepted rules into one body.
    const draftRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill-draft`,
    });
    expect(draftRes.statusCode).toBe(200);
    const draft = draftRes.json();
    expect(draft.name).toMatch(/-conventions$/);
    expect(draft.type).toBe('convention');
    expect(draft.source).toBe('extracted');
    expect(draft.body).toContain('Enable strict mode in tsconfig');
    expect(draft.body).toContain('Rethrow caught errors as AppError');
    expect([...draft.evidence_files].sort()).toEqual(['src/foo.ts', 'tsconfig.json']);

    // 5. Save the draft via the EXISTING POST /skills.
    const createRes = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
        enabled: true,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const skill = createRes.json();
    expect(skill.name).toBe(draft.name);

    // 6. The new skill shows up in GET /skills.
    const skillsList = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(skillsList.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    // 7. Seed an agent and link the skill to it via POST /agents/:id/skills.
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Conv Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
      })
    ).json();

    const linkRes = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id },
    });
    expect(linkRes.statusCode).toBe(200);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links.some((l: { skill_id: string }) => l.skill_id === skill.id)).toBe(true);

    await app.close();
  });
});
