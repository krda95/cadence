/**
 * Reads a number typed by a person. Both "0.5" and "0,5" are accepted, since many keyboards
 * only offer a comma. Empty or invalid input gives null.
 */
export function parseDecimal(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? '')
    .trim()
    .replace(',', '.');

  if (text === '') {
    return null;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : null;
}
