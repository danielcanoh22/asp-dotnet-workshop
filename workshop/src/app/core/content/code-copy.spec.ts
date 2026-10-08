import { handleCodeCopyClick } from './code-copy';

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

const BLOCK =
  '<div class="code-block"><button type="button" class="code-block__copy" data-copy>' +
  '<span class="material-symbols-outlined">content_copy</span><span class="code-block__copy-label">Copiar</span></button>' +
  '<pre><code class="language-csharp">var x = 1;\n</code></pre></div>';

describe('handleCodeCopyClick', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('copies the code text when a copy button is clicked', async () => {
    const host = mount(BLOCK);
    const writeText = vi.fn().mockResolvedValue(undefined);
    host.addEventListener('click', (event) => handleCodeCopyClick(event, { writeText }));

    host.querySelector<HTMLElement>('.material-symbols-outlined')!.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('var x = 1;\n');
  });

  it('shows "Copiado" feedback and restores the label afterwards', async () => {
    vi.useFakeTimers();
    const host = mount(BLOCK);
    const writeText = vi.fn().mockResolvedValue(undefined);
    host.addEventListener('click', (event) => handleCodeCopyClick(event, { writeText }));
    const button = host.querySelector<HTMLElement>('[data-copy]')!;

    button.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(button.classList.contains('is-copied')).toBe(true);
    expect(button.querySelector('.code-block__copy-label')!.textContent).toBe('Copiado');

    await vi.advanceTimersByTimeAsync(2000);

    expect(button.classList.contains('is-copied')).toBe(false);
    expect(button.querySelector('.code-block__copy-label')!.textContent).toBe('Copiar');
  });

  it('ignores clicks outside copy buttons', () => {
    const host = mount(BLOCK);
    const writeText = vi.fn();
    host.addEventListener('click', (event) => handleCodeCopyClick(event, { writeText }));

    host.querySelector<HTMLElement>('pre')!.click();

    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not throw when the clipboard rejects', async () => {
    const host = mount(BLOCK);
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    host.addEventListener('click', (event) => handleCodeCopyClick(event, { writeText }));
    const button = host.querySelector<HTMLElement>('[data-copy]')!;

    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(button.classList.contains('is-copied')).toBe(false);
  });
});
