import type { MarkedExtension, RendererThis, Token, TokenizerThis, Tokens } from 'marked';

/**
 * Custom Markdown syntax of the workshop (the contract with the tutorial authors):
 *
 *   :::concept Optional title        callouts: concept | why | tip | warning | vs |
 *   Markdown body...                           checkpoint | troubleshooting | recap
 *   :::
 *
 *   ::::challenge Title              4+ colons so the inner 3-colon blocks can nest
 *   Statement...
 *   :::hint                          one or more, numbered automatically
 *   ...
 *   :::
 *   :::solution
 *   ...
 *   :::
 *   ::::
 *
 *   ```csharp title="Controllers/BooksController.cs"   -> filename header above the block
 *
 * A container closes on the first line made of exactly the same number of colons that opened it.
 */

const TOKEN_TYPE = 'workshopContainer';

type CalloutKind =
  | 'concept'
  | 'why'
  | 'tip'
  | 'warning'
  | 'vs'
  | 'checkpoint'
  | 'troubleshooting'
  | 'recap';
type ContainerKind = CalloutKind | 'challenge' | 'hint' | 'solution';

interface CalloutMeta {
  readonly label: string;
  readonly icon: string;
}

const CALLOUTS: Record<CalloutKind, CalloutMeta> = {
  concept: { label: 'Concepto', icon: 'psychology' },
  why: { label: '¿Por qué?', icon: 'help' },
  tip: { label: 'Tip', icon: 'lightbulb' },
  warning: { label: 'Atención', icon: 'warning' },
  vs: { label: 'En Visual Studio', icon: 'computer' },
  checkpoint: { label: 'Checkpoint', icon: 'check_circle' },
  troubleshooting: { label: 'Errores comunes', icon: 'local_fire_department' },
  recap: { label: 'Resumen', icon: 'push_pin' },
};

const CONTAINER_KINDS: ReadonlySet<string> = new Set<ContainerKind>([
  ...(Object.keys(CALLOUTS) as CalloutKind[]),
  'challenge',
  'hint',
  'solution',
]);

interface ContainerToken extends Tokens.Generic {
  type: typeof TOKEN_TYPE;
  kind: ContainerKind;
  titleTokens: Token[];
  tokens: Token[];
  /** 1-based position among the hints of the parent challenge. */
  hintNumber?: number;
}

// Opening line: 3+ colons, a lowercase type, optional title.
const OPENING_LINE = /^(:{3,})([a-z]+)[ \t]*([^\n]*)(?:\n|$)/;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function isContainer(token: Token): token is ContainerToken {
  return token.type === TOKEN_TYPE;
}

function icon(name: string, cssClass: string): string {
  return `<span class="material-symbols-outlined ${cssClass}" aria-hidden="true">${name}</span>`;
}

function tokenizeContainer(this: TokenizerThis, src: string): ContainerToken | undefined {
  const opening = OPENING_LINE.exec(src);
  if (!opening) return undefined;

  const [openingRaw, colons, kind, title] = opening;
  if (!CONTAINER_KINDS.has(kind)) return undefined;

  const rest = src.slice(openingRaw.length);
  const closing = new RegExp(`^:{${colons.length}}[ \\t]*$`, 'm').exec(rest);
  if (!closing) return undefined; // Unclosed: leave the text alone instead of swallowing the page.

  const closingEnd = closing.index + closing[0].length;
  const trailingNewline = rest[closingEnd] === '\n' ? 1 : 0;
  const body = rest.slice(0, closing.index);

  const token: ContainerToken = {
    type: TOKEN_TYPE,
    raw: openingRaw + rest.slice(0, closingEnd + trailingNewline),
    kind: kind as ContainerKind,
    titleTokens: this.lexer.inlineTokens(title.trim()),
    tokens: this.lexer.blockTokens(body, []),
  };

  if (token.kind === 'challenge') {
    let hintCount = 0;
    for (const child of token.tokens) {
      if (isContainer(child) && child.kind === 'hint') child.hintNumber = ++hintCount;
    }
  }

  return token;
}

function renderContainer(this: RendererThis, token: Tokens.Generic): string {
  const container = token as ContainerToken;
  const body = this.parser.parse(container.tokens);
  const title = container.titleTokens.length
    ? this.parser.parseInline(container.titleTokens)
    : '';

  switch (container.kind) {
    case 'challenge':
      return (
        `<section class="challenge">` +
        `<header class="challenge__header">${icon('ads_click', 'challenge__icon')}` +
        `<span class="challenge__label">Reto</span>` +
        (title ? `<span class="challenge__title">${title}</span>` : '') +
        `</header><div class="challenge__body">${body}</div></section>\n`
      );
    case 'hint':
      return (
        `<details class="challenge-hint"><summary>Pista ${container.hintNumber ?? 1}</summary>` +
        `<div class="challenge-detail__body">${body}</div></details>\n`
      );
    case 'solution':
      return (
        `<details class="challenge-solution"><summary>Ver solución</summary>` +
        `<div class="challenge-detail__body">` +
        `<p class="challenge-solution__note">Inténtalo primero por tu cuenta.</p>${body}</div></details>\n`
      );
    default: {
      const meta = CALLOUTS[container.kind];
      return (
        `<aside class="callout callout--${container.kind}">` +
        `<header class="callout__header">${icon(meta.icon, 'callout__icon')}` +
        `<span class="callout__label">${meta.label}</span>` +
        (title ? `<span class="callout__title">${title}</span>` : '') +
        `</header><div class="callout__body">${body}</div></aside>\n`
      );
    }
  }
}

const COPY_BUTTON =
  '<button type="button" class="code-block__copy" data-copy aria-label="Copiar código">' +
  `${icon('content_copy', 'code-block__copy-icon')}<span class="code-block__copy-label">Copiar</span></button>`;

/** Splits a fence info string such as `csharp title="Controllers/BooksController.cs"`. */
function parseInfoString(info: string | undefined): { language: string; title: string | undefined } {
  const trimmed = (info ?? '').trim();
  const language = /^\S*/.exec(trimmed)?.[0] ?? '';
  const title = /\btitle="([^"]*)"/.exec(trimmed)?.[1];
  return { language, title };
}

function renderCode({ text, lang }: Tokens.Code): string {
  const { language, title } = parseInfoString(lang);
  const languageClass = language ? ` class="language-${escapeHtml(language)}"` : '';
  const pre = `<pre><code${languageClass}>${escapeHtml(text.replace(/\n$/, ''))}\n</code></pre>`;

  if (title) {
    return (
      `<div class="code-block"><div class="code-block__header">` +
      `<span class="code-block__filename">${escapeHtml(title)}</span>${COPY_BUTTON}</div>${pre}</div>\n`
    );
  }
  return `<div class="code-block code-block--bare">${COPY_BUTTON}${pre}</div>\n`;
}

export const workshopMarkdownExtension: MarkedExtension = {
  extensions: [
    {
      name: TOKEN_TYPE,
      level: 'block',
      // Lets a paragraph end right before a container, so no blank line is required before `:::`.
      start: (src: string) => src.search(/^:{3,}[a-z]/m),
      tokenizer: tokenizeContainer,
      renderer: renderContainer,
    },
  ],
  renderer: { code: renderCode },
};
