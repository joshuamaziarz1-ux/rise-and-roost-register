// Parse decimal input without binary floating-point financial arithmetic.
export function dollarsToCents(value) {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) throw new Error('Enter dollars with no more than two decimal places.');
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}
export const centsToDollars = cents => Math.trunc(cents / 100) + '.' + String(cents % 100).padStart(2, '0');
