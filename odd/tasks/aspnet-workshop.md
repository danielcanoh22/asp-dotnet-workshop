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
- [ ] T1 Scaffold: Angular 22 app in `workshop/` (bun), Material M3 theme, ngx-markdown + Prism, test runner verified, README + .gitignore. Route: delegated (writer trigger: 2+ non-trivial files).
- [ ] T2 Content engine: manifest types, registry, content service, marked extension for custom blocks + titled code fences + copy button, with tests. Route: delegated.
- [ ] T3 Catalog screen: elegant cards (number, title, level, duration, topics, progress, status, coming-soon). Route: delegated.
- [ ] T4 Overview + step reader + progress service (sidebar TOC with checks, prev/next, mark complete, global progress). Route: delegated.
- [ ] T5 Reference Bookshelf API built and verified with .NET 10 (build, run, every endpoint smoke-tested) in `reference-solutions/01-bookshelf-api/`. Route: delegated (verification worker).
- [ ] T6 Tutorial 1 content, steps 00–07. Route: delegated.
- [ ] T7 Tutorial 1 content, steps 08–14. Route: delegated.
- [ ] T8 Final verification: `ng build` production, tests, content readback, code-in-content matches reference. Route: inline/delegated verifier.

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

## Next step
T1 + T5 (T5 builds in scratch, no repo writes until copied).
