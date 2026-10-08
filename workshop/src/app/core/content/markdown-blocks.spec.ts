import { Marked } from 'marked';
import { workshopMarkdownExtension } from './markdown-blocks';

function render(markdown: string): string {
  return new Marked(workshopMarkdownExtension).parse(markdown, { async: false }) as string;
}

describe('workshop markdown blocks', () => {
  describe('callouts', () => {
    const cases: [type: string, label: string][] = [
      ['concept', 'Concepto'],
      ['why', '¿Por qué?'],
      ['tip', 'Tip'],
      ['warning', 'Atención'],
      ['vs', 'En Visual Studio'],
      ['checkpoint', 'Checkpoint'],
      ['troubleshooting', 'Errores comunes'],
      ['recap', 'Resumen'],
    ];

    it.each(cases)('renders ":::%s" as a styled aside with label "%s"', (type, label) => {
      const html = render(`:::${type} My title\nBody **bold**\n:::`);

      expect(html).toContain(`<aside class="callout callout--${type}">`);
      expect(html).toContain(`<span class="callout__label">${label}</span>`);
      expect(html).toContain('<span class="callout__title">My title</span>');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('material-symbols-outlined');
    });

    it('omits the title element when no title is given', () => {
      const html = render(':::tip\nHello\n:::');

      expect(html).toContain('callout--tip');
      expect(html).not.toContain('callout__title');
    });

    it('lexes the body as full Markdown (lists, inline code, code fences)', () => {
      const html = render(':::concept Title\n- one\n- two\n\nUse `var`.\n\n```csharp\nint x = 1;\n```\n:::');

      expect(html).toContain('<li>one</li>');
      expect(html).toContain('<code>var</code>');
      expect(html).toContain('language-csharp');
    });

    it('supports inline Markdown inside the title', () => {
      const html = render(':::tip Usa `dotnet run`\nx\n:::');

      expect(html).toContain('<code>dotnet run</code>');
    });

    it('interrupts a paragraph that is directly followed by a container', () => {
      const html = render('Before\n:::tip\nInside\n:::\nAfter');

      expect(html).toContain('<p>Before</p>');
      expect(html).toContain('callout--tip');
      expect(html).toContain('<p>After</p>');
    });

    it('leaves unknown container types as plain text', () => {
      const html = render(':::banana\nx\n:::');

      expect(html).not.toContain('callout');
      expect(html).toContain(':::banana');
    });

    it('does not swallow content when a container is never closed', () => {
      const html = render(':::tip\nunclosed');

      expect(html).not.toContain('callout--tip');
      expect(html).toContain('unclosed');
    });

    it('renders several containers in a row', () => {
      const html = render(':::tip\nA\n:::\n\n:::warning\nB\n:::');

      expect(html.match(/<aside/g)).toHaveLength(2);
      expect(html).toContain('callout--tip');
      expect(html).toContain('callout--warning');
    });

    it('handles Windows line endings', () => {
      const html = render(':::tip Title\r\nBody\r\n:::\r\n');

      expect(html).toContain('callout--tip');
      expect(html).toContain('Body');
    });
  });

  describe('challenge', () => {
    const challenge = [
      '::::challenge Implementa GET /api/books/{id}',
      'Enunciado con `code`.',
      '',
      ':::hint',
      'Primera pista',
      ':::',
      '',
      ':::hint',
      'Segunda pista',
      ':::',
      '',
      ':::solution',
      '```csharp title="Controllers/BooksController.cs"',
      'return Ok();',
      '```',
      ':::',
      '::::',
    ].join('\n');

    it('renders a card with label and title', () => {
      const html = render(challenge);

      expect(html).toContain('<section class="challenge">');
      expect(html).toContain('<span class="challenge__label">Reto</span>');
      expect(html).toContain('Implementa GET /api/books/{id}');
      expect(html).toContain('<code>code</code>');
    });

    it('numbers multiple hints as collapsed details', () => {
      const html = render(challenge);

      expect(html).toContain('<summary>Pista 1</summary>');
      expect(html).toContain('<summary>Pista 2</summary>');
      expect(html).toContain('Primera pista');
      expect(html).toContain('Segunda pista');
      expect(html).not.toMatch(/<details[^>]* open/);
    });

    it('renders the solution as details with a "try it first" note', () => {
      const html = render(challenge);

      expect(html).toContain('<summary>Ver solución</summary>');
      expect(html).toContain('Inténtalo primero por tu cuenta');
      expect(html).toContain('Controllers/BooksController.cs');
      expect(html).toContain('return Ok();');
    });

    it('keeps the order: statement, hints, solution', () => {
      const html = render(challenge);

      expect(html.indexOf('Enunciado')).toBeLessThan(html.indexOf('Pista 1'));
      expect(html.indexOf('Pista 2')).toBeLessThan(html.indexOf('Ver solución'));
    });

    it('restarts hint numbering for each challenge', () => {
      const html = render(`${challenge}\n\n${challenge}`);

      expect(html.match(/<summary>Pista 1<\/summary>/g)).toHaveLength(2);
      expect(html.match(/<summary>Pista 2<\/summary>/g)).toHaveLength(2);
    });

    it('allows a callout nested in a challenge', () => {
      const html = render('::::challenge T\nText\n\n:::tip\nNested\n:::\n::::');

      expect(html).toContain('callout--tip');
      expect(html).toContain('<section class="challenge">');
    });
  });

  describe('code fences', () => {
    it('renders title="..." as a filename header and keeps the language for Prism', () => {
      const html = render('```csharp title="Controllers/BooksController.cs"\nvar x = 1 < 2;\n```');

      expect(html).toContain('class="code-block__filename">Controllers/BooksController.cs</span>');
      expect(html).toContain('<code class="language-csharp">');
      expect(html).toContain('var x = 1 &lt; 2;');
    });

    it('adds a copy button to every code block', () => {
      const titled = render('```json title="appsettings.json"\n{}\n```');
      const plain = render('```bash\ndotnet run\n```');

      expect(titled).toContain('data-copy');
      expect(plain).toContain('data-copy');
    });

    it('does not add a filename header to a plain fence', () => {
      const html = render('```bash\ndotnet run\n```');

      expect(html).not.toContain('code-block__filename');
      expect(html).toContain('<code class="language-bash">dotnet run\n</code>');
    });

    it('handles fences without language', () => {
      const html = render('```\nplain\n```');

      expect(html).toContain('plain');
      expect(html).not.toContain('language-undefined');
    });

    it('escapes the title', () => {
      const html = render('```csharp title="<script>.cs"\nx\n```');

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;.cs');
    });
  });
});
