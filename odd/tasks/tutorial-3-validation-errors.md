# Feature: Tutorial 3 — Advanced validation and error handling (Task Tracker evolved)
Objective: third workshop tutorial plus its verified reference solution. Branch: `feat/tutorial-3-validation-errors` (stacked on `feat/tutorial-2-task-tracker`, which is not merged into main yet).
Delivery: single-pr (user choice, L4), one commit per work unit. Test runner: `bunx ng test --watch=false` (Angular/Vitest); C# verified by build + replay + HTTP smoke checks.

## Specs
- S1 User request (L1): "Continua con el siguiente tutorial del workshop". Next catalog entry = #3 "Validación avanzada y manejo de errores" (intermediate; topics FluentValidation, ProblemDetails, Exception handling; slug `advanced-validation-errors`).
- S2 Project decision (user, 2026-10-23): "Evolucionar Task Tracker (Recommended)" — the tutorial starts from the tutorial 2 reference solution and evolves it. This fulfils the promise in `task-tracker-api/14-performance-docs-wrap-up.md:490` (rules that do not fit an attribute; database errors such as the tag unique index translated into clear responses instead of `500`).
- S3 Same conventions as tutorials 1 and 2 (odd/tasks/aspnet-workshop.md): prose and UI copy in neutral Spanish ("tú"); code, identifiers, comments, file names and commits in English; .NET 10 LTS + Visual Studio 2026; concept-first steps with `concept`/`why`/`vs`/`checkpoint`/`troubleshooting`/`recap`/`challenge` blocks; filename-titled code fences.
- S4 Verified reference solution in `reference-solutions/03-task-tracker-validation/`; every C# snippet in the tutorial matches it (final replay diff == reference, ports aside).
- S5 Registration: new manifest + one registry line; the coming-soon #3 entry is replaced. No component changes.
- Assumption A1: prerequisite is tutorial 2 finished (the reader's own project or a copy of `reference-solutions/02-task-tracker-api/`).
- Assumption A2: the step plan below is the parent's design; the user may reshape it.

## Design (reference solution, subject to T1 verification)
- Packages added: `FluentValidation` + `FluentValidation.DependencyInjectionExtensions` 12.1.x (net8.0 target, runs on .NET 10). `FluentValidation.AspNetCore` (auto-validation) is NOT used: deprecated by its authors.
- Validation moves fully to FluentValidation (one source of truth): `AddValidation()` and DataAnnotations removed; one `AbstractValidator<T>` per request record in `Validation/`; generic endpoint filter `ValidationFilter<T>` + `WithValidation<T>()` extension; `TimeProvider` injected for the "due date not in the past" rule. Tradeoff taught: OpenAPI loses maxLength/pattern metadata from attributes.
- Business rules as explicit results: delete project with open tasks → 409 unless `?force=true`; max 5 tags per task → 409. `Errors/ApiProblems.cs` builds consistent problems (`type`, `title`, `detail`, extension `code`).
- FluentValidation messages pinned with `ValidatorOptions.Global.LanguageManager.Culture = CultureInfo.InvariantCulture` (otherwise they follow the OS culture). Error keys stay PascalCase, same as tutorial 2.
- `CustomizeProblemDetails`: adds `instance` ("METHOD /path"). `traceId` is already added by .NET 10 (verified), so it is explained, not coded.
- `IExceptionHandler` chain: `DatabaseExceptionHandler` (`DbUpdateConcurrencyException` first, then SQLite unique 2067 / FK 787 → 409) then `GlobalExceptionHandler` (`BadHttpRequestException` → its status; rest → 500, logged, `detail` only in Development). Replaces tutorial 2's `StatusCodeSelector`. 499 dropped: not reproducible by hand. `app.UseExceptionHandler()` without options.
- Optimistic concurrency: `TaskItem.Version` is `int` (not Guid: existing rows get 0 and stay updatable), `IsConcurrencyToken()`, migration `AddTaskVersion`, `TaskResponse.Version`, `UpdateTaskRequest.Version` (`int?` + `NotNull()`); Update sets `OriginalValue` from the request and bumps; ChangeStatus bumps; `ExecuteUpdate` bumps with `t.Version + 1`. Tag assignment does not bump (join table only). ETag/If-Match as the HTTP-native alternative (concept only).
- `errors.http` is born in step 02 (the audit) and grows; tutorial 2's "Validation errors" section moves there. Main `.http`: POST task due date 2030-12-01 (step 06), `?force=true` on DELETE project 2 (step 08), `"version": 0` on PUT task (step 11).

## Step plan (12 steps; slug `advanced-validation-errors`; files `workshop/public/tutorials/advanced-validation-errors/NN-<id>.md`)
- overview.md — what you build, what you learn, not covered, prerequisites (tutorial 2), final error catalog table.
- 01 error-taxonomy (15) — concepts only: validation vs business rule vs not found vs conflict vs unexpected; who detects each; 400/404/409/412/422/499/500; ProblemDetails (RFC 9457) recap.
- 02 starting-point-audit (20) — copy the tutorial 2 project, run it, `errors.http` audit that provokes today's weak spots (past due date accepted, project with open tasks deleted silently, duplicate tag race → 500, malformed JSON, no way to detect lost updates).
- 03 limits-of-data-annotations (25) — IValidatableObject for a cross-field rule; why attributes cannot use DI, async or `TimeProvider`; motivation for FluentValidation.
- 04 fluentvalidation-basics (35) — install packages, first validators for projects, rules and messages, manual `ValidateAsync` + `ValidationProblem(result.ToDictionary())` in a handler.
- 05 validation-endpoint-filter (30) — generic `ValidationFilter<T>`, `WithValidation<T>()`, `AddValidatorsFromAssemblyContaining`, remove `AddValidation()` + attributes; OpenAPI tradeoff.
- 06 advanced-rules (35) — task and tag validators: `When`, `Must` with `TimeProvider`, shared rule extensions, `Cascade(CascadeMode.Stop)`, why async DB checks usually belong in the handler.
- SEAM (end of 06): exact snapshot at scratchpad `seam-step06/` (verified: build 0 warnings, `errors.http` run). Writer T2 ends exactly there; writer T3 starts exactly there.
- 07 consistent-problem-details (25) — `CustomizeProblemDetails` (`instance`, `traceId`), `Errors/ApiProblems.cs`, machine-readable `code`, documenting errors in OpenAPI.
- 08 business-rules (35) — delete project with open tasks (409 + `?force=true`), tag limit per task (409); 409 vs 422 debate; exceptions vs explicit results (Result pattern as a preview of tutorial 4).
- 09 global-exception-handler (35) — `IExceptionHandler`, `IProblemDetailsService`, `GlobalExceptionHandler`, logging, Development vs Production, `SuppressDiagnosticsCallback`.
- 10 database-errors (30) — `DbUpdateException` + `SqliteException` codes, `DatabaseExceptionHandler`, handler order, reproduce the race by removing the pre-check.
- 11 optimistic-concurrency (40) — lost update, concurrency token, migration `AddTaskVersion`, `DbUpdateConcurrencyException` → 409, bump in `ExecuteUpdate`; ETag/If-Match alternative.
- 12 wrap-up (25) — final `errors.http` suite, error catalog, recap, next tutorials.

## Tasks
- [x] T1 (S2, S4) Reference solution built incrementally from tutorial 2's reference, verified (build 0 warnings, migration applied, every error path smoke-tested). Route: inline (no writer reason). Commit 314c16c.
- [ ] T2 (S3, S4) Content: overview + steps 01–06. Route: delegated writer (parallelism with T3, disjoint files).
- [ ] T3 (S3, S4) Content: steps 07–12. Route: delegated writer (parallelism with T2, disjoint files).
- [ ] T4 (S5) Manifest + registry + spec (RED first). Route: inline.
- [ ] T5 (S1–S5) Final verification: ng test, ng build, replay diffs, container balance, dev server. Route: inline.

## Log
- L1 (2026-10-23, user): "Continua con el siguiente tutorial del workshop"
- L2 (2026-10-23, user choice): Project = "Evolucionar Task Tracker (Recommended)".
- L3: branch `feat/tutorial-3-validation-errors` created from `feat/tutorial-2-task-tracker` (1f918fe). Sources checked: FluentValidation docs (minimal API manual validation, `AddValidatorsFromAssemblyContaining`, `ToDictionary`); NuGet FluentValidation 12.1.1 (net8.0); MS Learn aspnetcore-10.0 error handling (`IExceptionHandler` order, .NET 10 suppresses diagnostics for handled exceptions, `CustomizeProblemDetails`).
- L4 (2026-10-23, user choice): delivery = "single-pr (Recommended)".
- L5 T1 evidence: FluentValidation 12.1.1, EF Core tools via `dotnet tool exec dotnet-ef@10.0.13` (`migrations add AddTaskVersion`; `has-pending-model-changes`: none). Build 0 warnings/0 errors (scratch and in repo). Smoke: every validator (400 with PascalCase keys), 404 ProblemDetails with `instance`, 409 business rules (`project.has_open_tasks`, `task.tag_limit_reached`, idempotent re-assign at the limit still 204), `?force=true` 204, unique index 2067 and FK 787 → 409 (probe copy without pre-checks), 500 with `detail` in Development and without it in Production (logged), stale version → 409 `concurrency.conflict`, missing version → 400, migration applied over a populated DB. Both `.http` files run in order on a fresh seed.
  Findings: (a) FluentValidation localizes to the OS culture ("'Name' no debería estar vacío.") → culture pinned. (b) `Cascade` only exists on `IRuleBuilderInitial`. (c) launch profile `http` overrides `ASPNETCORE_ENVIRONMENT`; Production test needs `--no-launch-profile`. (d) In Production, Minimal APIs return 400 for bad input without throwing (framework "Bad Request"); in Development they throw and `GlobalExceptionHandler` answers ("Bad request" + detail). (e) EF logs `fail` for a `DbUpdateException` even when the handler translates it.
