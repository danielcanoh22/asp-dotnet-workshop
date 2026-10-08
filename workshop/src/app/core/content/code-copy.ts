export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

const FEEDBACK_MS = 2000;

/**
 * Event-delegation handler for the copy buttons rendered next to every code block.
 * Attach it once to the container that holds the rendered Markdown.
 */
export function handleCodeCopyClick(event: Event, clipboard: ClipboardWriter): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLElement>('[data-copy]');
  const code = button?.closest('.code-block')?.querySelector('pre code');
  if (!button || !code) return;

  clipboard
    .writeText(code.textContent ?? '')
    .then(() => showCopiedFeedback(button))
    .catch(() => {
      // Clipboard access denied (insecure context or permissions): nothing else to do.
    });
}

function showCopiedFeedback(button: HTMLElement): void {
  const label = button.querySelector('.code-block__copy-label');
  const original = label?.textContent ?? 'Copiar';

  button.classList.add('is-copied');
  if (label) label.textContent = 'Copiado';

  setTimeout(() => {
    button.classList.remove('is-copied');
    if (label) label.textContent = original;
  }, FEEDBACK_MS);
}
