# Feature: ASP.NET Core Workshop

## Objective
An Angular 22 web app that hosts very detailed, incremental, concept-first tutorials that guide the user
through building ASP.NET Core projects locally in Visual Studio 2026 (.NET 10 LTS). Tutorial 1: "Bookshelf API".

## Problem / Why
The user knows C# and is moving to ASP.NET Core backend development. They need guided material that explains
the *why* of every concept (DI, middleware, routing, controllers...) before code, with progressive challenges
for patterns already practiced. No code runs in the browser; the app is a reader/guide.

## Scope
- Angular app in `workshop/` (Angular 22, standalone, signals, zoneless, Angular Material 22 M3, ngx-markdown 22.1 + Prism).
- Content engine: typed manifest per tutorial + one-line registry; Markdown steps in `workshop/public/tutorials/<slug>/`.
- Custom Markdown blocks (see "Content syntax").
- Screens: catalog (cards), tutorial overview, step reader with sidebar/progress.
- Progress persisted in `localStorage` (wrapped in try/catch).
- Verified reference solution for tutorial 1 in `reference-solutions/01-bookshelf-api/`.
- Tutorial 1 content: ~14 steps.

## Constraints
- Language: tutorial prose AND workshop UI copy in neutral Spanish (using "tú", no regional slang);
  ALL code, identifiers, code comments, file names and commit messages in English.
- Conventional commits, NO Co-Authored-By / AI attribution (user rule).
- Package manager: bun. Node 24, Angular CLI 22.1.8, .NET SDK 10.0.401.
- Architecture: screaming/feature-based (`features/catalog`, `features/tutorial-reader`, `core/content`, `core/progress`, `shared/ui`).
- ~400 authored changed lines per task is an advisory planning heuristic only, never a cap.

## TDD
- Mode: strict, ON. Source: user global config (CLAUDE.md "Strict TDD Mode: enabled").
- Runner: Angular CLI unit tests (`bun run test` → `ng test`, Vitest builder default in Angular 22). Confirmed in T1.
- Applies to Angular logic (registry, markdown extension, progress service, routing helpers, components with logic).
- Markdown prose and the C# reference API are verified functionally (dotnet build + run + HTTP smoke checks),
  because the reference must match exactly what the tutorial teaches (tutorial 1 does not teach testing).

## Content syntax (contract between engine and content)
Fenced containers; outer containers use 4 colons when they contain inner containers.

```
:::concept Título del concepto
Markdown...
:::
```
Block types: `concept` (🧠), `why` (❓), `tip` (💡), `warning` (⚠️), `vs` (🛠️ Visual Studio instructions),
`checkpoint` (✅), `troubleshooting` (🔥), `recap` (📌), `challenge` (🎯, contains `hint` and `solution`).

```
::::challenge Implementa GET /api/books/{id}
Enunciado...

:::hint
Pista 1
:::

:::solution
```csharp title="Controllers/BooksController.cs"
...
```
:::
::::
```
Code fences accept `title="path/File.cs"` → rendered as a filename header. Every code block has a copy button.
Hints and solution are collapsed `<details>`; the solution shows a "try it first" note.

## Tasks
- [x] T1 Scaffold: Angular 22 app in `workshop/` (bun), Material M3 theme, ngx-markdown + Prism, test runner verified, README + .gitignore. Route: delegated (writer trigger: 2+ non-trivial files).
- [x] T2 Content engine: manifest types, registry, content service, marked extension for custom blocks + titled code fences + copy button, with tests. Route: delegated.
- [x] T3 Catalog screen: elegant cards (number, title, level, duration, topics, progress, status, coming-soon). Route: delegated.
- [x] T4 Overview + step reader + progress service (sidebar TOC with checks, prev/next, mark complete, global progress). Route: delegated.
- [x] T5 Reference Bookshelf API built and verified with .NET 10 (build, run, every endpoint smoke-tested) in `reference-solutions/01-bookshelf-api/`. Route: delegated (verification worker).
- [x] T6 Tutorial 1 content: overview + steps 01–07. Route: delegated.
- [x] T7 Tutorial 1 content: steps 08–15. Route: delegated.
- [x] T8 Final verification: `ng build` production, tests, content readback, code-in-content matches reference. Route: inline/delegated verifier.

## Acceptance criteria
- Adding a tutorial = new content folder + manifest + one registry line; no component changes.
- Catalog, overview and reader work; progress survives reload; production build passes; tests pass.
- Every C# snippet in tutorial 1 corresponds to the verified reference solution.
- Each step: concept-first explanation, exact VS 2026 instructions, filename-labelled code, checkpoint, common errors;
  challenges appear for already-practiced patterns, with hints and hidden solution.

## Delivery
- Strategy: ask-on-risk (default). Branch: `feat/aspnet-workshop`. RDD: off (global) → `gentle-ai review assess` tiers after writers.

## Progress / Evidence
- 2026-10-08: repo initialized (`main` root commit 5475057), branch `feat/aspnet-workshop` created.

- T1–T4 (delegated writer, trigger: 2+ non-trivial files): commits ccef837..eaad0e4 (17 commits, TDD RED commits included).
  `bunx ng test --watch=false`: 12 files / 113 tests passed (re-run by parent as spot check: 113 passed).
  `bunx ng build`: success, no warnings, 448 kB initial raw / 123 kB transfer.
  Visual browser check pending (Chrome extension not connected); rendering covered by jsdom tests.
- T5 (delegated verification worker in scratch): .NET 10.0.401, Bookshelf.slnx, Scalar.AspNetCore 2.17.14.
  `dotnet build`: 0 warnings/0 errors; every endpoint smoke-tested (200/201/204/400/404/500 ProblemDetails, persistence after restart).
  HTTPS response untested (curl/schannel), redirect 307 observed. Copied to repo: commits 1b54621, 61e6f95; parent rebuild: 0 errors.
- Review: RDD off (global). `gentle-ai review assess --base-ref main --committed-only --untracked-scope=exclude`: risk medium
  (executable_change .gitattributes), review_due slice_budget_reached; RDD off → no review started; writer self-verification + parent spot check.
- Delivery: branch exceeds ~400 authored lines; chain strategy question deferred to the user at close (no PR requested yet).
- Steps finalized at 15 (added 13 complete-crud challenges, moved http-basics before host/middleware).

- T6 (delegated writer): commits 5711ab1..879e077 (one per file). Replay of steps 01–07 in scratch built 0 errors at steps 03/05/06/07, checkpoints curled, challenge solutions verified; ng test 113 passed; ng build ok; container balance check clean. VS 2026 UI facts confirmed via MS Learn or caveated in text.

- T7 (delegated writer): commits 864f968..de64f04. Replay built 0 warnings/0 errors after every step 08–15; checkpoints and challenge solutions curled. Final `diff -r` replay vs reference: only ports differ (launchSettings, .http host). Tutorial total 410 min. Findings documented in content: OpenAPI omits inferred 200 when an action has [ProducesResponseType] (step 13/15 tip); PATCH {} clears rating (design choice).
- T8 (parent): ng test 113 passed; ng build ok; working tree clean; dev server served app + overview/08/15 markdown (200). Real-browser visual check NOT done (Chrome extension not connected).

## Next step
Visual browser check by the user (`cd workshop && bun start`); decide PR chain strategy before opening PRs; tutorial 2 when requested.
