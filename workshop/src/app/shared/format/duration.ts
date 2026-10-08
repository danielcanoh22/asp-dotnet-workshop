/** Formats minutes as "45 min", "1 h" or "1 h 30 min". Returns an empty string for non-positive values. */
export function formatMinutes(minutes: number): string {
  if (!(minutes > 0)) return '';

  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
