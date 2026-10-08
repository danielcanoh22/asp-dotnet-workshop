import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideWorkshopMarkdown } from '../../../core/content/markdown.providers';
import { MarkdownView } from './markdown-view';

async function render(content: string) {
  TestBed.configureTestingModule({
    imports: [MarkdownView],
    providers: [provideHttpClient(), provideWorkshopMarkdown()],
  });
  const fixture = TestBed.createComponent(MarkdownView);
  fixture.componentRef.setInput('content', content);
  await fixture.whenStable();
  // ngx-markdown renders asynchronously; wait for its pending render task.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('MarkdownView', () => {
  it('renders the custom callout blocks through ngx-markdown', async () => {
    const root = await render(':::tip Un consejo\nContenido **importante**\n:::');

    expect(root.querySelector('aside.callout--tip')).not.toBeNull();
    expect(root.querySelector('.callout__title')?.textContent).toBe('Un consejo');
    expect(root.querySelector('strong')?.textContent).toBe('importante');
  });

  it('renders titled code blocks highlighted by Prism', async () => {
    const root = await render('```csharp title="Program.cs"\nvar app = builder.Build();\n```');

    expect(root.querySelector('.code-block__filename')?.textContent).toBe('Program.cs');
    expect(root.querySelector('pre code.language-csharp .token.keyword')).not.toBeNull();
  });

  it('keeps raw HTML produced by the blocks (sanitizer disabled for trusted content)', async () => {
    const root = await render('::::challenge Reto\nTexto\n\n:::hint\nUna pista\n:::\n::::');

    expect(root.querySelector('section.challenge details.challenge-hint summary')?.textContent).toBe('Pista 1');
  });

  it('copies code through the delegated click handler', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const root = await render('```bash\ndotnet run\n```');

    root.querySelector<HTMLElement>('[data-copy]')!.click();

    expect(writeText).toHaveBeenCalledWith('dotnet run\n');
    vi.unstubAllGlobals();
  });
});
