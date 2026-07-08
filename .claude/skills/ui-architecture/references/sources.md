# Sources — Front-End Fundamentals

Curated best-practice sources, grouped by topic. Primary authorities: `react.dev`,
`patterns.dev`, `bulletproof-react`. Blog posts included where they capture a concrete
pattern well. Validated July 2026.

## Component composition — passing components (props vs children vs element props)
- https://react.dev/learn/passing-props-to-a-component — official: `children`, element-as-prop
- https://www.patterns.dev/react/ — compound components, HOC, render props, container/presenter
- https://legacy.reactjs.org/docs/composition-vs-inheritance.html — composition over inheritance

## How components should be split / component design
- https://react.dev/learn/thinking-in-react — break UI into a component hierarchy
- https://www.robinwieruch.de/react-folder-structure/ — component granularity + colocation
- https://reactpatterns.com/ — catalog of composition patterns

## Where business logic lives (UI vs hooks vs pure functions)
- https://profy.dev/article/react-architecture-business-logic-and-dependency-injection — framework-agnostic logic + DI
- https://felixgerschau.com/react-hooks-separation-of-concerns/ — custom hooks as the logic layer
- https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks

## Folder / project structure (feature-based, screaming architecture, unidirectional imports)
- https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md — reference structure (shared → features → app)
- https://www.joshwcomeau.com/react/file-structure/ — pragmatic colocation
- https://profy.dev/article/react-folder-structure — screaming architecture comparison

## Constants / config in separate files (magic numbers, env, feature flags)
- https://www.joshwcomeau.com/react/file-structure/ — `constants.js`, colocated config
- https://medium.com/@austinpaley32/how-to-add-a-constants-file-to-your-react-project-6ce31c015774
- https://www.pluralsight.com/guides/how-to-store-and-read-configuration-files-using-react — env + config; no secrets client-side

## Effects / avoiding derived-state bugs
- https://react.dev/learn/you-might-not-need-an-effect — the single most important anti-pattern doc
- https://react.dev/learn/escape-hatches

## State management: client vs server state boundary
- https://tanstack.com/query/latest/docs/framework/react/overview — server state belongs in TanStack Query
- https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k — decision guide

## TypeScript with React (typing props / children / events)
- https://react.dev/learn/typescript — official
- https://react-typescript-cheatsheet.netlify.app/docs/basic/getting-started/basic_type_example/ — avoid `React.FC`; `ComponentProps`, `PropsWithChildren`

## Accessibility + Core Web Vitals
- https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/HTML — semantic HTML first
- Core Web Vitals targets: INP ≤200ms · LCP ≤2.5s · CLS <0.1; WCAG 2.2 AA baseline
