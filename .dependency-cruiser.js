/**
 * Founding layering ruleset — authored by the architect (CLAUDE.md §2.3, TC-7).
 *
 * This file is the architecture, not a description of it. arc42 §5.2 defines five
 * modules and one permitted dependency direction; every edge that description
 * forbids is forbidden HERE, and CI fails on a violation. Conformance is a build
 * failure, not a reviewer's opinion.
 *
 *   npm run lint:arch
 *
 * If a rule below and arc42 §5 ever disagree, arc42 wins and this file is the bug
 * (CLAUDE.md §4) — but the fix is to change both in the same commit, because a rule
 * nobody enforces is a comment.
 *
 * The layering, top to bottom. An arrow may only point downward or sideways-right:
 *
 *     src/http/         Fastify edge — routes, TypeBox schemas, problem+json     (ADR-0005)
 *          |
 *     src/application/  use cases; owns the ADR-0004 retry loop and its spans
 *          |                        \
 *     src/domain/       pure policy   src/persistence/  Kysely + SQL + SQLSTATE   (ADR-0006/0007)
 *          ^                                 |
 *          +---------------------------------+  (types only, in practice)
 *
 *     src/platform/     config · logger · telemetry — a leaf: imports nothing from src/
 *     src/main.ts       composition root — the only module allowed to see every layer
 *
 * Full reasoning: docs/adr/0008-module-decomposition.md.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    // ─────────────────────────────────────────────────────────── the core rule ──
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'src/domain holds the scheduling policy and NOTHING else: interval derivation (A-1), ' +
        'the occupancy interval the constraint sees (A-4), the opening-hours rule (ADR-0001) ' +
        'and candidate ordering (ADR-0009). It may import nothing — no other src/ module, no ' +
        'npm package, no node: builtin. Deliberately absolute, with no allowlist: the moment ' +
        'an exception is granted this stops being a statement about the core and becomes a ' +
        'list. IANA-zone conversion uses the Intl global, which needs no import. ' +
        'What this buys: the policy core CANNOT perform I/O, so it cannot consult the ' +
        'database — which turns GC-1 ("the opening-hours check must never acquire knowledge ' +
        'of what is booked", ADR-0001) from a promise into a build failure.',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },

    // ──────────────────────────────────────────────────── the dependency direction ──
    {
      name: 'http-must-not-reach-persistence',
      severity: 'error',
      comment:
        'No route may issue SQL. Every database access goes through a use case, which is ' +
        'what owns the retry policy (ADR-0004) and the availability/insert span split (§8.4). ' +
        'A handler that queries directly has neither.',
      from: { path: '^src/http/' },
      to: { path: '^src/persistence/' },
    },
    {
      name: 'application-must-not-reach-http',
      severity: 'error',
      comment:
        'A use case must be callable without a server, so acceptance and integration tests ' +
        'can drive it over HTTP while unit-level work drives it directly. Transport concerns ' +
        '— status codes, problem+json, request parsing — belong in src/http.',
      from: { path: '^src/application/' },
      to: { path: '^src/http/' },
    },
    {
      name: 'persistence-must-not-look-upward',
      severity: 'error',
      comment:
        'src/persistence may depend on src/domain (types) and src/platform, never on the ' +
        'layers above it. A repository that knows about a use case is a use case.',
      from: { path: '^src/persistence/' },
      to: { path: '^src/(http|application)/' },
    },
    {
      name: 'platform-is-a-leaf',
      severity: 'error',
      comment:
        'src/platform is config, logging and telemetry: importable by everyone, importing ' +
        'nothing from src/. That shape is also exactly the shape of a junk drawer, so this ' +
        'rule keeps it from acquiring behaviour — it cannot depend on anything that has any.',
      from: { path: '^src/platform/' },
      to: { path: '^src/(?!platform/)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle means the two modules are one module with a false boundary between them, ' +
        'and it makes the layering above unenforceable in principle.',
      from: {},
      to: { circular: true },
    },

    // ───────────────────────────────────────────── the invariant is not portable ──
    {
      name: 'sql-only-in-persistence',
      severity: 'error',
      comment:
        'THE most important rule after domain-is-pure. SQLSTATE 23P01 is translated in ' +
        'exactly one module (src/persistence/pgError.ts). A second translation site is the ' +
        'classic way a 409 quietly starts meaning two different things, and how err.constraint ' +
        '— which ADR-0009 uses to prune candidates and §8.4 uses to label ' +
        'booking_conflicts_total{resource} — gets dropped on one path and not the other. ' +
        'pg and kysely are importable from src/persistence and nowhere else.',
      from: { path: '^src/', pathNot: '^src/persistence/' },
      to: { path: '^node_modules/(pg|pg-pool|pg-protocol|pg-types|kysely)(/|$)' },
    },
    {
      name: 'http-framework-only-in-the-edge',
      severity: 'error',
      comment:
        'Fastify is a transport, not an architecture (ADR-0005). Confined to src/http so ' +
        'policy and use cases never acquire a dependency on a request object. src/main.ts is ' +
        'exempt: it is the composition root and it holds the server handle it listens on.',
      from: { path: '^src/', pathNot: '^src/(http/|main\\.ts$)' },
      to: { path: '^node_modules/(fastify|@fastify/[^/]+|@sinclair/typebox)(/|$)' },
    },

    // ───────────────────────────────────────────────── test independence (OC-5, P4) ──
    {
      name: 'outside-in-tests-do-not-import-src',
      severity: 'error',
      comment:
        'Acceptance, contract, property and concurrency tests define *done* and are written ' +
        'by a role that never reads src/ (CLAUDE.md §5, METHODOLOGY P4). They reach the system ' +
        'the way a client does — over HTTP, and over SQL against the real database. An import ' +
        'from src/ is that independence quietly spent, and the path hook cannot see it because ' +
        'the file being written is one the test-engineer legitimately owns.',
      from: { path: '^tests/(acceptance|contract|property|concurrency)/' },
      to: { path: '^src/' },
    },

    // ──────────────────────────────────────────────────────────────── hygiene ──
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        'An import that does not resolve is a module the rules above cannot classify, so ' +
        'every layering rule silently stops applying to it.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-dev-dep-in-src',
      severity: 'error',
      comment:
        'Production code importing a devDependency runs in development and fails on deploy. ' +
        'Test helpers belong in tests/.',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      comment: 'Deprecated node builtins; they will be removed.',
      from: {},
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?(punycode|domain|constants|sys|_linklist|_stream_wrap)$',
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'A module nothing imports is either dead or wired up somewhere the graph cannot see. ' +
        'Warn rather than error: entry points and type-only declaration files are legitimately ' +
        'orphaned, and this is a prompt to look rather than a verdict.',
      from: {
        orphan: true,
        pathNot: ['(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$', '\\.d\\.ts$', '^src/main\\.ts$'],
      },
      to: {},
    },
  ],

  options: {
    // node_modules is reported (so sql-only-in-persistence and no-dev-dep-in-src can
    // see package imports) but not traversed. Do NOT add `includeOnly: '^src/'` here:
    // it would drop npm modules from the graph and silently disable both of those rules.
    doNotFollow: { path: 'node_modules' },

    // Added once the TypeScript scaffold lands (phase 4). tsPreCompilationDeps is not
    // optional: without it `import type { Kysely } from 'kysely'` is erased before
    // dependency-cruiser sees it, and domain-is-pure stops catching the most likely
    // way the core acquires a dependency on infrastructure.
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,

    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },

    reporterOptions: {
      // Feeds arc42 §5.3, which is generated and never hand-drawn.
      archi: {
        collapsePattern:
          '^(src/(http|application|domain|persistence|platform)|node_modules/(@[^/]+/[^/]+|[^/]+))',
      },
      dot: { collapsePattern: '^node_modules/(@[^/]+/[^/]+|[^/]+)' },
    },
  },
};
