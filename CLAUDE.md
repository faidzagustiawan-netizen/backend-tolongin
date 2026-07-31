# backend — NestJS + Prisma + Python ML workers

Own git repo (`origin`: `faidzagustiawan-netizen/backend-tolongin`). Push straight to `main`.
Modules under `src/`: admin, ai, auth, challenges, common, companies, discussions, health, mail,
notifications, payments, portfolios, prisma, question-bank, seed, skills, stages, storage,
submissions, subscriptions, tokens, users, utils, verification.

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
