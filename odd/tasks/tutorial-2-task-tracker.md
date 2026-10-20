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

## Step plan (14 steps; slug `task-tracker-api`; files `workshop/public/tutorials/task-tracker-api/NN-<id>.md`)
Every step ends with code that builds and runs. Code states below are the contract; final state == reference solution.
- overview.md — what you build, what you learn, what is NOT covered (auth, tests, Clean Architecture: later tutorials), prerequisites (tutorial 1 knowledge, VS 2026, .NET 10 SDK), final endpoint table.
- 01 from-controllers-to-minimal-apis (15) — concepts only: Minimal APIs vs controllers, when each fits, what changes and what stays (DI, middleware, ProblemDetails). No code.
- 02 create-project (20) — VS 2026 "ASP.NET Core Web API", project `TaskTracker.Api`, solution `TaskTracker` (.slnx), .NET 10, "Use controllers" UNCHECKED, OpenAPI on, no auth. Tour + run weatherforecast via .http, then delete the weather code (Program keeps AddOpenApi/MapOpenApi/UseHttpsRedirection).
- 03 first-endpoints (30) — `Entities/Project.cs` (no navigations), `Contracts/ProjectContracts.cs` (no attributes; 4-field ProjectResponse), lambdas in Program.cs over a captured in-memory `List<Project>`: MapGet/MapPost, parameter binding sources (route, query, body, services), Results vs TypedResults. Challenge: PUT + DELETE lambdas.
- 04 route-groups-typed-results (25) — move to `Endpoints/ProjectEndpoints.cs` (MapGroup, WithTags, named static handlers, `Results<...>`, `CreatedAtRoute` + WithName); lambdas can no longer capture the list → `Data/InMemoryProjectStore.cs` singleton via DI; `Mappings/ProjectMappings.cs` (simple `ToResponse` extension); AddProblemDetails + UseExceptionHandler + UseStatusCodePages (empty 404 → ProblemDetails).
- 05 orm-and-efcore (20) — concepts: ORM, DbContext/DbSet, providers, SQLite (file DB), code-first; install `Microsoft.EntityFrameworkCore.Sqlite` + `Microsoft.EntityFrameworkCore.Tools` 10.0.x via NuGet UI.
- 06 dbcontext-and-entities (30) — `Data/TaskTrackerDbContext.cs` (Projects only), `Data/Configurations/ProjectConfiguration.cs`, conventions vs Fluent API, connection string in appsettings.json, AddDbContext (scoped lifetime, link to tutorial 1 DI). Endpoints still use the in-memory store.
- 07 migrations (30) — PMC `Add-Migration InitialCreate`, read Up/Down + snapshot, `Update-Database`, `__EFMigrationsHistory`, inspecting the .db, `Remove-Migration`, `Script-Migration`; `dotnet ef` CLI alternative; SQLite limits (only additive migrations here).
- SEAM (end of 07): exact snapshot at scratchpad `seam-step07/` (verified: build 0 warnings, CRUD smoke OK). Writer T2 ends exactly there; writer T3 starts exactly there.
- 08 projects-crud (40) — ProjectEndpoints switch to TaskTrackerDbContext (async + CancellationToken), delete InMemoryProjectStore + its registration; AsNoTracking, FindAsync, change tracking, SaveChanges, Remove; Expression vs Func (`ToResponseExpression` + compiled `ToResponse`); discover missing `Z` on GET → `Data/UtcDateTimeConverter.cs` + `ConfigureConventions` (no migration needed).
- 09 one-to-many-tasks (40) — `TaskItem` (why not `Task`), `TaskItemStatus`, `TaskPriority`, `TaskItemConfiguration` (string conversion for Status, int Priority on purpose, FK cascade, composite index), `Project.Tasks`, DbSet Tasks, `Add-Migration AddTasks`; ProjectResponse gains TaskCount/CompletedTaskCount (navigation inside projection); Include vs projection, no lazy loading.
- 10 task-endpoints-queries (40) — `Contracts/TaskContracts.cs` (no attributes yet, TaskResponse WITHOUT Tags), `Mappings/TaskMappings.cs`, `Endpoints/TaskEndpoints.cs` (two groups; GetByProject with `[AsParameters] TaskListQuery`, deferred execution, filters, sorting incl. nulls-last); JsonStringEnumConverter(allowIntegerValues: false); invalid enum → 500 in Development → `StatusCodeSelector` fix. Challenges: Update, ChangeStatus (CompletedAt rule), Delete.
- 11 many-to-many-tags (40) — `Tag`, `TagConfiguration` (unique index, `TaskTags` join table), `TaskItem.Tags`, DbSet Tags, `Add-Migration AddTags`; `Contracts/TagContracts.cs` (no attributes yet), `Endpoints/TagEndpoints.cs` (GetAll, Create with lower-casing + 409 Problem, Delete via Find+Remove), AssignTag/RemoveTag (Include, idempotent add), TaskResponse gains Tags, tag filter.
- 12 validation (30) — first prove SQLite does NOT enforce max length (150-char name saved), then `AddValidation()`, DataAnnotations on all request records (final attributes), `ProducesValidationProblem()`, `ProducesProblem(409)` on tag create; validation vs DB constraints.
- 13 bulk-ops-seeding (30) — ExecuteUpdate (complete-all), ExecuteDelete (completed tasks; refactor tag Delete), `BulkOperationResponse`, change tracker bypass caveats; `Data/DataSeeder.cs` + UseSeeding/UseAsyncSeeding; dev-only `MigrateAsync` in a created scope; `Drop-Database` + `Update-Database` to see the seed.
- 14 performance-docs-wrap-up (30) — reading the SQL log, `EnableSensitiveDataLogging` (dev only), N+1, AsNoTracking, indexes recap; Scalar.AspNetCore 2.17.14 + MapScalarApiReference; final .http; recap and next tutorials.

## Tasks
- [x] T1 (S2, S3, S5) Reference solution built incrementally, verified (build 0 warnings, migrations applied, every endpoint smoke-tested). Route: inline (no writer reason). Commit b922ad5.
- [x] T2 (S4, S5) Content: overview + steps 01–07. Route: delegated writer (parallelism with T3, disjoint files). Commit 58c1916.
- [ ] T3 (S4, S5) Content: steps 08–14. Route: delegated writer (parallelism with T2, disjoint files).
- [ ] T4 (S6) Manifest + registry + spec (RED first). Route: inline.
- [ ] T5 (S1–S6) Final verification: ng test, ng build, replay diff vs reference, container balance. Route: inline + independent verifier for content.

## Log
- L1 (2026-10-20, user): "Ya es hora de empezar a construir el tutorial #2"
- L2 (2026-10-20, user choice): Project = "New project with relations (Recommended)".
- L3 (2026-10-20, user choice): Domain = "Task tracker (Recommended)".
- L4: branch `feat/tutorial-2-task-tracker` created from main (9cad5d8). MS Learn checked: .NET 10 `AddValidation` for Minimal APIs; EF 9+ `UseSeeding` runs on `Update-Database`; SQLite migration limits.
- L5 (2026-10-20, user choice): delivery = "single-pr (Recommended)".
- L6 T1 evidence: EF Core 10.0.13 (Sqlite + Tools), OpenApi 10.0.12, Scalar 2.17.14. Migrations generated in 3 stages; `has-pending-model-changes`: none. Build 0 warnings/0 errors. Fresh DB via `database update` ran UseSeeding; startup MigrateAsync no-op. Smoke: all CRUD/filter/sort/tag/bulk endpoints, 400 validation, 404/409 ProblemDetails, cascade deletes, OpenAPI + /scalar.
  Findings fixed in reference: (a) Development `ThrowOnBadRequest` made bad enum query/body → 500; fixed with `ExceptionHandlerOptions.StatusCodeSelector`. (b) SQLite returns DateTime Kind=Unspecified (no `Z`); fixed with `UtcDateTimeConverter` via `ConfigureConventions` (no migration change). (c) OpenAPI marked optional description as required → default `= null`; 409 documented with `ProducesProblem`.
  Gotchas: enum query binding is case-sensitive (`sortBy=duedate` → 400); dotnet-ef needs a restored project ("Unable to retrieve project metadata" otherwise).
- L7 Seam snapshot end-of-07 built in scratchpad `seam-step07/` and smoke-tested (CRUD in-memory, InitialCreate applied).
- L8 Consistency fix (consequence of L2): tutorial 1 step 09 promised that tutorial 2 would swap Bookshelf's repository for a database "sin tocar controller ni servicio"; reworded as a hypothetical. T2 and T3 writers launched in parallel. T4 RED observed ("expected undefined to be 2"), GREEN 114/114; commit held until content lands.
- L9 T2 evidence: 8 files, 2,642 lines. Writer replay from Markdown: 0 warnings/0 errors at every step, checkpoints curled; final diff vs seam rc=0 (parent re-ran the diff: rc=0). Deviations: Remove-Migration taught before Update-Database (keeps the snapshot byte-identical); temporary binding-demo endpoint in step 03 removed within the step. Unverified VS 2026 details are worded with caveats (Get-DbContext output, SQLite Toolbox support for VS 2026).
