export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

export function handleCodeCopyClick(_event: Event, _clipboard: ClipboardWriter): void {
  // Stub for the RED phase.
}
