# ASP.NET Core Workshop

Guided, concept-first tutorials to learn ASP.NET Core (.NET 10, Visual Studio 2026) by building real projects.
The tutorial text and the workshop UI are in Spanish; all code is in English.

| Folder | What it is |
| --- | --- |
| `workshop/` | Angular 22 reader app (catalog, overview, step reader, progress). No code runs in the browser. |
| `reference-solutions/` | Verified .NET solutions that match the code shown in each tutorial. |
| `odd/` | Feature planning notes. |

## Run the workshop app

Requirements: Node 24, [bun](https://bun.sh).

```bash
cd workshop
bun install
bun run start        # http://localhost:4200
bun run test         # unit tests (Angular unit-test builder + Vitest)
bun run build        # production build in workshop/dist
```

> `katex` and `marked-katex-extension` are installed even though the workshop does not render math:
> ngx-markdown dynamically imports `marked-katex-extension`, and the Vite dev server fails with
> HTTP 500 on the ngx-markdown module when that optional peer cannot be resolved. The production
> build is unaffected either way.

## How to add a tutorial

Adding a tutorial never requires touching a component.

1. **Content**: create `workshop/public/tutorials/<slug>/` with `overview.md` and one file per step (`01-some-step.md`, ...).
2. **Manifest**: create `workshop/src/app/core/content/manifests/<slug>.manifest.ts` exporting a `TutorialManifest`
   (slug, number, title, subtitle, summary, level, estimatedMinutes, topics, `status: 'available'`, steps `{ id, title, file, estimatedMinutes }`).
3. **Register**: add ONE line to the array in `workshop/src/app/core/content/registry.ts`.

A unit test validates the registry (unique slugs/numbers/step ids, available tutorials have steps).
Tutorials with `status: 'coming-soon'` and no steps show up as muted cards.

## Markdown syntax for authors

Standard Markdown plus these blocks. A container opens with `:::type Optional title` and closes with a line containing
only `:::`. Use a blank line around the blocks to keep the source readable.

````markdown
:::concept Title      <!-- concept | why | tip | warning | vs | checkpoint | troubleshooting | recap -->
Any **Markdown**, lists, code fences...
:::

::::challenge Title   <!-- 4 colons so the inner 3-colon blocks can nest -->
Statement...

:::hint
First hint (add as many as you need; they are numbered automatically)
:::

:::solution
```csharp title="Controllers/BooksController.cs"
// code
```
:::
::::
````

- Code fences accept `title="path/File.cs"` to show a filename header. Every code block has a copy button.
- Highlighted languages: `csharp`, `json`, `bash`, `powershell`, `http`, `xml`/`markup`.
- A container closes on the first line made of exactly the same number of colons that opened it; an unclosed container is left as plain text.
- Markdown is trusted content (sanitization is disabled on purpose), so never render untrusted input with this engine.

Progress is stored in `localStorage` (`aspnet-workshop.progress.v1`), the theme in `aspnet-workshop.theme.v1`.
