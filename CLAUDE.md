# backend — NestJS + Prisma + Python ML workers

Own git repo (`origin`: `faidzagustiawan-netizen/backend-tolongin`). Push straight to `main`.
Modules under `src/`: admin, ai, auth, challenges, common, companies, discussions, health, mail,
notifications, payments, portfolios, prisma, question-bank, seed, skills, stages, storage,
submissions, subscriptions, tokens, users, utils, verification.

## Project docs must stay current — `dokumen/`

`dokumen/` holds eight documents describing the **whole project — backend and frontend both**,
indexed by `dokumen/README.md`: `PRD.md`, `SystemArchitecture.md`, `DatabaseSchema.md`,
`APISpecification.md`, `TechStack.md`, `Changelog.md`, `TestingPlan.md`, `DeploymentGuide.md`.
They live in this repo so they are versioned and shared; a change in `../frontend` still updates
them here.

**Update them in the same turn as the code change — never defer.** A change is not done until the
affected documents match it.

| Code change | Documents that must change with it |
|---|---|
| Feature, role, business rule, pricing, quota | `PRD.md` |
| New module/guard/cron/integration, bootstrap change | `SystemArchitecture.md` |
| `schema.prisma`, migration, index, seed | `DatabaseSchema.md` (+ `PRD.md` if a rule changes) |
| Controller, route, DTO, endpoint guard, WebSocket event | `APISpecification.md` |
| `package.json`, `requirements.txt`, tool version | `TechStack.md` (+ `DeploymentGuide.md` if env vars change) |
| Test file, jest/vitest/playwright config, CI workflow | `TestingPlan.md` |
| Env var, `ecosystem.config.js`, `deploy.yml`, release step | `DeploymentGuide.md` |

`Changelog.md` always gets an entry under the current period — it is the one document every
meaningful change touches. Entries carry the repo tag `[BE]`/`[FE]` and the commit type.

Never copy `.env` values into any document; list variable *names* and their purpose only.

### After pulling someone else's work

A teammate also pushes to both repos. Right after `git pull` here or in `../frontend` (or when a
session starts on a tree that moved), audit the incoming commits against the table above before
doing anything else:

```bash
git -C backend log --oneline --stat HEAD@{1}..HEAD
```

```bash
git -C frontend log --oneline --stat HEAD@{1}..HEAD
```

Trigger paths to look for: `prisma/`, `src/**/*.controller.ts`, `src/**/*.module.ts`,
`package.json`, `requirements.txt`, `.github/workflows/`, `**/*.spec.ts`, `ecosystem.config.js`,
and on the frontend `app/**/page.tsx`, `services/`, `next.config.ts`, `lib/plans.ts`. Reconcile the
drift, then report what was out of date and what was updated. If a commit's intent is unclear from
its message and diff, say so rather than guessing in the docs.

## Commands

- dev server: prefer the `backend` entry in `../.claude/launch.json` (port 3001), not a raw shell
- typecheck: `npx tsc --noEmit -p tsconfig.json`
- unit tests: `npm test` (jest) · e2e: `npm run test:e2e`
- lint: `npm run lint` · build: `npm run build` (nest build)

## Prisma

- `npx prisma migrate deploy` may be run without asking — this is still dev, no data worth keeping.
- Migrations must go through `DIRECT_URL` (port 5432). The pooled `DATABASE_URL` (port 6543,
  pgbouncer) breaks `prisma migrate`.

## Python ML workers (`src/ai/python`)

- Runtime interpreter is `.venv-ml` — Python 3.11.9, tensorflow 2.15.1. `PYTHON_BIN` points here.
- `.venv-ml312` — Python 3.12.3, tensorflow 2.21.0 — exists for experiments only.
- Do **not** use the system Python 3.14: no TensorFlow wheel exists for it.
- Syntax check: `& D:\Tolongin\backend\.venv-ml\Scripts\python.exe -m py_compile <files>`
- Face-match thresholds: trust the measured Facenet512 distances in memory, not the comments in
  `verify_face.py` — those numbers are from the previous model and are wrong.

## Production (VPS, pm2)

- Run remote commands through `bash -lc` — the box has two Node versions and a plain `ssh host cmd`
  picks up the wrong one.
- App runs under pm2 as `tolongin-backend`.
- The machine is 2 vCPU / 2 GB. `FACE_WORKER_POOL_SIZE=1` is deliberate: two face workers held
  ~1.45 GB and fought over the same cores. Do not raise it without adding RAM.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
