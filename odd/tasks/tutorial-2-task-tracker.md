# Feature: Tutorial 2 — Task Tracker API (Minimal APIs + EF Core + SQLite)
Objective: second workshop tutorial plus its verified reference solution. Branch: `feat/tutorial-2-task-tracker`.
Delivery: single-pr (user choice, L5), one commit per work unit. Test runner: `bunx ng test --watch=false` (Angular/Vitest); C# verified by build + replay + HTTP smoke checks.

## Specs
- S1 User request (L1): "Ya es hora de empezar a construir el tutorial #2". Tutorial 2 = catalog entry "Minimal APIs + EF Core + SQLite" (beginner; topics Minimal APIs, EF Core, SQLite, Migrations).
- S2 Project decision (user, 2026-10-20): "New project with relations" — a new API from scratch, not an evolution of Bookshelf.
- S3 Domain decision (user, 2026-10-20): "Task tracker" — Projects → Tasks (1-to-many), Tasks ↔ Tags (many-to-many).
- S4 Same conventions as tutorial 1 (odd/tasks/aspnet-workshop.md): prose and UI copy in neutral Spanish ("tú"); code, identifiers, comments, file names and commits in English; .NET 10 LTS + Visual Studio 2026; concept-first steps with `concept`/`why`/`vs`/`checkpoint`/`troubleshooting`/`recap`/`challenge` blocks; filename-titled code fences.
- S5 Verified reference solution in `reference-solutions/02-task-tracker-api/`; every C# snippet in the tutorial matches it (final replay diff == reference, ports aside).
- S6 Registration: new manifest + one registry line; the coming-soon #2 entry is replaced. No component changes.
- Assumption A1: prerequisite is tutorial 1 knowledge (DI, middleware, ProblemDetails, .http files); concepts are briefly recapped, tutorial 1 code is not needed.
- Assumption A2: migrations only add tables/columns (SQLite cannot drop/alter columns in migrations; MS Learn "SQLite EF Core Database Provider Limitations").

## Design (reference solution, subject to T1 verification)
- `TaskTracker.Api` (.NET 10 Web API template, "Use controllers" unchecked). Packages: Microsoft.AspNetCore.OpenApi, Microsoft.EntityFrameworkCore.Sqlite, Microsoft.EntityFrameworkCore.Tools (PMC), Scalar.AspNetCore.
- Entities: `Project`, `TaskItem` (not `Task`: clashes with System.Threading.Tasks.Task), `Tag`; enums `TaskItemStatus`, `TaskPriority`. Fluent configuration via `IEntityTypeConfiguration<T>`.
- Migrations: `InitialCreate` (Projects) → `AddTasks` → `AddTags`. Seeding via `UseSeeding`/`UseAsyncSeeding`.
- Endpoints in route groups (`MapGroup`, `TypedResults`, `Results<...>`), one static class per resource.
- Validation: `AddValidation()` + DataAnnotations on request records; ProblemDetails; enums as strings.
- Bulk ops: `ExecuteUpdate`/`ExecuteDelete`; SQL logging via `Microsoft.EntityFrameworkCore.Database.Command`; OpenAPI + Scalar.

## Step outline (target ~14 steps, ~420 min)
01 from-controllers-to-minimal-apis · 02 create-project · 03 first-endpoints · 04 route-groups-typed-results ·
05 orm-and-efcore · 06 dbcontext-and-entities · 07 migrations · 08 projects-crud · 09 one-to-many-tasks ·
10 task-endpoints-queries · 11 many-to-many-tags · 12 validation · 13 bulk-ops-seeding · 14 performance-docs-wrap-up

## Tasks
- [ ] T1 (S2, S3, S5) Reference solution built incrementally, verified (build 0 warnings, migrations applied, every endpoint smoke-tested). Route: inline (no writer reason).
- [ ] T2 (S4, S5) Content: overview + steps 01–07. Route: delegated writer (parallelism with T3, disjoint files).
- [ ] T3 (S4, S5) Content: steps 08–14. Route: delegated writer (parallelism with T2, disjoint files).
- [ ] T4 (S6) Manifest + registry + spec (RED first). Route: inline.
- [ ] T5 (S1–S6) Final verification: ng test, ng build, replay diff vs reference, container balance. Route: inline + independent verifier for content.

## Log
- L1 (2026-10-20, user): "Ya es hora de empezar a construir el tutorial #2"
- L2 (2026-10-20, user choice): Project = "New project with relations (Recommended)".
- L3 (2026-10-20, user choice): Domain = "Task tracker (Recommended)".
- L4: branch `feat/tutorial-2-task-tracker` created from main (9cad5d8). MS Learn checked: .NET 10 `AddValidation` for Minimal APIs; EF 9+ `UseSeeding` runs on `Update-Database`; SQLite migration limits.
- L5 (2026-10-20, user choice): delivery = "single-pr (Recommended)".
