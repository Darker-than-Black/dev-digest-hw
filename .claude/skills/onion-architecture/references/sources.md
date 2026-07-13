# Sources — Onion Architecture (backend)

Curated best-practice sources, grouped by topic. Primary authorities: Palermo's original onion
posts (via the comparisons below), `sairyss/domain-driven-hexagon` (reference structure), and the
tool docs for enforcement. Blog posts included where they capture a concrete pattern well.
Validated July 2026.

## Onion / clean / hexagonal — concepts & comparison
- https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391 — onion in Node/TS, layer walkthrough
- https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/ — clean + DDD + onion in TypeScript
- https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad — SOLID + onion + DI (InversifyJS)
- https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/ — layered Node.js, dependency rule
- https://khalilstemmler.com/articles/domain-driven-design-intro/ — DDD intro, domain-centric layering
- https://programmingpulse.vercel.app/blog/hexagonal-vs-clean-vs-onion-architectures — side-by-side of the three
- https://ccd-akademie.de/en/clean-architecture-vs-onion-architecture-vs-hexagonal-architecture/ — origins (Cockburn 2005 / Palermo 2008 / Martin 2012)
- https://romanglushach.medium.com/understanding-hexagonal-clean-onion-and-traditional-layered-architectures-a-deep-dive-c0f93b8a1b96 — deep dive across the four styles
- https://www.thoughtworks.com/en-us/insights/blog/architecture/demystify-software-architecture-patterns — "same DNA" — all DIP-based
- https://medium.com/@rup.singh88/stop-confusing-clean-onion-hexagonal-architecture-heres-when-to-use-each-692079e56267 — when to use each
- https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f — pragmatism; warns against over-engineering small services

## Ports & adapters / repository / dependency inversion
- https://github.com/sairyss/domain-driven-hexagon — **primary reference structure**: layers, naming, ports, dep-cruiser enforcement
- https://docs.synapsestudios.com/concepts/architecture/dependency-inversion.html — ports defined by the app's needs, not the infra
- https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi — hexagonal + clean with TS examples
- https://dev.to/fyapy/repository-pattern-with-typescript-and-nodejs-25da — repository as the only data layer
- https://github.com/fastify/fastify-awilix — DI for Fastify (contrast: DevDigest uses its own `platform/container.ts`)
- https://www.npmjs.com/package/@fastify/awilix — `@fastify/awilix` package (asClass/asFunction lifetimes)

## Reference boilerplates (Node/TS onion)
- https://github.com/Melzar/onion-architecture-boilerplate — Node/Express onion, OOP variant
- https://github.com/RanKey1496/nodejs-starter — onion-architecture starter
- https://github.com/topics/onion-architecture?l=typescript — GitHub topic, TS filter

## Enforcement tooling (making the rings mechanical)
- https://github.com/javierbrea/eslint-plugin-boundaries — element-types boundary rules
- https://www.npmjs.com/package/eslint-plugin-boundaries — package + config reference
- https://medium.com/@taynan_duarte/ensuring-dependency-rules-in-a-nodejs-application-with-typescript-using-eslint-plugin-boundaries-68b70ce32437 — dependency rules in a Node/TS app, worked example
- https://spin.atomicobject.com/dependency-cruiser-imports/ — restrict imports with dependency-cruiser
- https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/ — dependency-cruiser forbidden rules in practice
- https://jmulholland.com/architecture-tools/ — survey of 6 architecture-enforcement tools
