# Enforcement — making the rings mechanical

Guidance alone drifts (see the `settings`/`workspace`/`polling`/`pulls` leaks). These configs make
the dependency rule fail the build the way a type error does. **Status: proposal** — ship the
config, dry-run it, then wire into CI once the known leaks are fixed or waived.

`dependency-cruiser` is **already a dependency** (repo-intel uses it for the product import-graph),
so adding an architecture ruleset costs nothing extra.

---

## Option A — dependency-cruiser (recommended; already installed)

`server/.dependency-cruiser.cjs` (arch subset — extend the existing config, don't replace it):

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-drizzle-outside-repository',
      comment: 'DB access (drizzle-orm / db/schema) lives only in the infra ring: repository.ts, adapters/, db/, platform/ (SKILL §4).',
      severity: 'error',
      // Exclusions = the infrastructure ring (repositories, adapters, db, platform composition root/jobs).
      from: { pathNot: '(repository\\.ts$|repository/|/db/|/adapters/|/platform/|app\\.ts$)' },
      to:   { path: '(drizzle-orm|src/db/schema)' },
    },
    {
      name: 'no-adapter-concrete-in-service',
      comment: 'Services depend on the port interface, not a concrete adapter (SKILL §3).',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to:   { path: 'src/adapters/' },
    },
    {
      name: 'transport-no-db',
      comment: 'routes.ts must not touch the DB — delegate to a service/repository (SKILL §5).',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/routes\\.ts$' },
      to:   { path: '(drizzle-orm|src/db/schema)' },
    },
    {
      name: 'domain-core-no-infra',
      comment: 'reviewer-core stays pure — no DB/fs/adapters (SKILL §2).',
      severity: 'error',
      from: { path: '^reviewer-core/src' },
      to:   { path: '(drizzle-orm|node:fs|/db/|/adapters/)' },
    },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' } },
};
```

Dry-run (does NOT fail CI yet — just reports):

```bash
cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs
```

Verified July 2026 against `server/src` — the tuned config flags exactly the real leaks and nothing
in the infra ring:

- `transport-no-db` → `settings/routes.ts`, `workspace/routes.ts`, `polling/routes.ts`, `pulls/routes.ts` (Drizzle in the route)
- `no-drizzle-outside-repository` → the same four routes + `settings/feature-models.ts` (helper reaching into `db/schema`)
- `no-adapter-concrete-in-service` → `repo-intel/service.ts` importing `adapters/codeindex/extract.ts` + `adapters/astgrep/index.ts` — review these: if they are pure type/util imports, add `repo-intel/` to an allow-list; if they instantiate an adapter, route it through the container.

`agents`/`repos`/`reviews` (repository-backed) stay clean, and `platform/`+`app.ts` are excluded as
infra. That divergence is the proof the rule works.

Wire in once leaks are addressed — `server/package.json`:

```jsonc
"scripts": { "lint:arch": "depcruise src --config .dependency-cruiser.cjs" }
```

Add `pnpm lint:arch` to the CI lint step. To land incrementally, downgrade the leaking rules to
`severity: 'warn'`, ratchet to `error` as each module gets a `repository.ts`.

---

## Option B — eslint-plugin-boundaries (editor-time red squiggles)

Better DX (inline feedback) but needs installing. `eslint.config.js` (flat):

```js
import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'transport',      pattern: 'src/modules/*/routes.ts',     mode: 'file' },
        { type: 'application',    pattern: 'src/modules/*/service.ts',     mode: 'file' },
        { type: 'infrastructure', pattern: ['src/modules/*/repository*', 'src/adapters/*', 'src/db/*'] },
        { type: 'domain',         pattern: ['src/vendor/shared/*'] },
      ],
    },
    rules: {
      'boundaries/element-types': [2, {
        default: 'disallow',
        rules: [
          { from: 'transport',      allow: ['application', 'domain'] },
          { from: 'application',    allow: ['domain'] },              // NOT infrastructure
          { from: 'infrastructure', allow: ['application', 'domain'] },
          { from: 'domain',         allow: [] },                       // depends on nothing outward
        ],
      }],
    },
  },
];
```

Inner-ring rule reads directly: `application` may reach `domain` but not `infrastructure`; `domain`
allows nothing. Use A and B together if the team wants both CI gating and editor feedback.

---

## Rollout

1. Land config as `warn`, run `lint:arch`, capture the leak list.
2. Fix one module at a time (introduce `repository.ts`, mirror `agents/`).
3. Flip each rule to `error` once its module is clean; add to CI.
