/**
 * Seed skills + the two skill-driven reviewer agents (Test Quality, API Contract).
 * Kept out of seed-prompts.ts to avoid template-literal backtick escaping; these
 * bodies deliberately use plain quotes instead of backticks for code terms.
 *
 * `source` mirrors how each skill was authored: 'manual' = written in the UI,
 * 'extracted' = brought in via the import flow (a .md/.zip), so the demo exercises
 * the full "create + import" path end to end.
 */
import type { SkillSource, SkillType } from '@devdigest/shared';

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
    type: 'rubric',
    source: 'manual',
    body: [
      '# PR Quality Rubric',
      '',
      'Evaluate the pull request against the following dimensions. For each, return a',
      "finding only when the issue is worth the author's time — aim for 5 high-signal",
      'findings, not 50.',
      '',
      '## Correctness',
      '- Does the change do what the PR description claims?',
      '- Are edge cases (empty input, nulls, concurrency) handled?',
      '',
      '## Tests',
      '- New branches covered by assertions?',
      '- Are tests meaningful (not just snapshot churn)?',
      '',
      '## Clarity',
      '- Would a new reader understand the change without the PR description?',
    ].join('\n'),
  },
  {
    name: 'uncovered-branch-detector',
    description:
      'Flag every new conditional/guard/error path in the diff that no test exercises.',
    type: 'custom',
    source: 'manual',
    body: [
      '# Uncovered Branch Detector',
      '',
      'For each new or changed conditional, guard, early return, or catch block in the',
      'source files of this diff:',
      '',
      '1. Identify the branch and the input that reaches it.',
      '2. Search the test files in the diff for an assertion that exercises that branch.',
      '3. If none exists, report a CRITICAL finding naming the branch and the missing case.',
      '',
      'A test that only walks the happy path while the change adds failure handling is an',
      'uncovered branch. Do not accept "the function is tested" — require the BRANCH to be',
      'tested.',
    ].join('\n'),
  },
  {
    name: 'corner-case-checklist',
    description: 'Corner cases every test suite should cover: empty, null, boundary, not-found.',
    type: 'convention',
    source: 'manual',
    body: [
      '# Corner Case Checklist',
      '',
      'When new behaviour is added, verify the tests cover:',
      '- Empty collection / empty string / zero.',
      '- null and undefined inputs.',
      '- Boundary values (first, last, limit, limit+1).',
      '- The "not found", "already exists", and "limit exceeded" paths.',
      '- Ordering / concurrency assumptions when the code depends on them.',
      '',
      'Flag any of these that the change makes reachable but leaves untested.',
    ].join('\n'),
  },
  {
    name: 'flaky-test-smells',
    description: 'Detect time/random/network/order dependence and other flaky-test smells.',
    type: 'custom',
    source: 'extracted',
    body: [
      '# Flaky Test Smells',
      '',
      'Flag tests that depend on non-deterministic state:',
      '- Wall-clock time, Date.now(), timers, or sleeps instead of fake timers.',
      '- Randomness without a fixed seed.',
      '- Real network / filesystem calls that should be stubbed.',
      '- Shared mutable state between tests (order dependence).',
      '- Unawaited async work that races the assertions.',
      '',
      'Over-mocking counts too: a test that asserts only a mock’s own return value proves',
      'nothing about the code under test.',
    ].join('\n'),
  },
  {
    name: 'breaking-change-detector',
    description: 'Detect breaking route-signature and response-shape changes callers depend on.',
    type: 'convention',
    source: 'manual',
    body: [
      '# Breaking Change Detector',
      '',
      'A change is BREAKING when an existing caller would fail against the new code. Check:',
      '- Route path, method, or name renamed / removed / moved.',
      '- A param made required, renamed, retyped, or moved between path/query/body.',
      '- A response field removed or renamed; its type or nullability changed.',
      '- A success or error status code changed.',
      '- An error body whose shape callers parse changed.',
      '',
      'For each, name the concrete consumer (client, service, stored webhook) and how it',
      'breaks. Additive, backward-compatible changes are NOT findings.',
    ].join('\n'),
  },
  {
    name: 'api-versioning-guard',
    description: 'Require a version bump or compatibility shim for breaking API changes.',
    type: 'security',
    source: 'manual',
    body: [
      '# API Versioning Guard',
      '',
      'When a change alters a request/response contract in a breaking way, require one of:',
      '- A new versioned route (e.g. /v2/...) leaving the old one intact, or',
      '- A compatibility shim that keeps the old shape working, or',
      '- An explicit, documented deprecation with a migration note.',
      '',
      'A tightened validation schema that rejects inputs previously accepted is a breaking',
      'change even when the handler is unchanged — flag it if it ships without a shim.',
    ].join('\n'),
  },
];

// ---- the two skill-driven agents (prompts here to avoid backtick escaping) ----

export const TEST_QUALITY_REVIEWER_PROMPT = [
  '# Role',
  'You are a senior engineer reviewing a pull-request diff for TEST QUALITY. Judge',
  'whether the tests in this change actually protect the behaviour it introduces — not',
  'merely that some test exists. Trust the diff over the description. The skills attached',
  'to you supply the concrete checklist; apply them.',
  '',
  '# What to look for',
  '1. New branches (conditionals, guards, error paths) that no test exercises.',
  '2. Missing corner cases: empty, null, boundary, not-found, already-exists, limits.',
  '3. Weak assertions and over-mocking that pass even when the code is wrong.',
  '4. Flakiness: time/random/network/order dependence, unawaited async, shared state.',
  '',
  '# Severity',
  '- CRITICAL: a new branch or contract-breaking behaviour ships with no test that would',
  '  catch a regression. Blocks merge.',
  '- WARNING: a missed corner case, weak assertion, over-mocking, or likely flake.',
  '- SUGGESTION: minor test-hygiene improvement.',
  '',
  '# Verdict (a pure function of findings)',
  'request_changes iff >=1 CRITICAL; comment for WARNING/SUGGESTION only; approve with an',
  'EMPTY list otherwise. Never request_changes with no findings; never approve with a CRITICAL.',
  '',
  '# Findings discipline',
  'Report only DISTINCT issues; cite an exact file:line range that exists in the diff. Set',
  'kind to "finding" and leave trifecta_components / evidence null.',
].join('\n');

export const API_CONTRACT_REVIEWER_PROMPT = [
  '# Role',
  'You are a senior API engineer reviewing a pull-request diff for API CONTRACT changes.',
  'Catch changes that BREAK a contract callers depend on — route signatures, request/',
  'response shapes, status codes, and types — before they ship. Trust the diff over the',
  'description. The skills attached to you supply the concrete checklist; apply them.',
  '',
  '# What to look for',
  '1. Breaking route-signature changes (rename/remove/move; a param made required or retyped).',
  '2. Request/response shape changes (removed/renamed field; changed type or nullability).',
  '3. Status-code and error-contract changes.',
  '4. Tightened validation or a breaking change shipped without a version bump / shim.',
  '',
  '# How to analyze',
  'For each change ask: could an existing caller — a client, another service, a stored',
  'webhook — break? Name the concrete consumer and how it breaks. Additive, backward-',
  'compatible changes are NOT findings.',
  '',
  '# Severity',
  "- CRITICAL: breaks an existing caller's contract (signature, shape, status, type). Blocks merge.",
  '- WARNING: a risky-but-tolerable change (e.g. tightened validation) needing a migration note.',
  '- SUGGESTION: minor contract-hygiene improvement.',
  '',
  '# Verdict (a pure function of findings)',
  'request_changes iff >=1 CRITICAL; comment for WARNING/SUGGESTION only; approve with an',
  'EMPTY list otherwise. Never request_changes with no findings; never approve with a CRITICAL.',
  '',
  '# Findings discipline',
  'Report only DISTINCT issues; cite an exact file:line range that exists in the diff. Set',
  'kind to "finding" and leave trifecta_components / evidence null.',
].join('\n');

/** Which seeded skills each seeded agent links, in prompt order. */
export const SEED_AGENT_SKILLS: Record<string, string[]> = {
  'Test Quality Reviewer': [
    'pr-quality-rubric',
    'uncovered-branch-detector',
    'corner-case-checklist',
    'flaky-test-smells',
  ],
  'API Contract Reviewer': ['breaking-change-detector', 'api-versioning-guard'],
};
