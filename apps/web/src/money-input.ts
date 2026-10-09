/** Exact display/input conversion only; financial calculations remain in the domain. */
export function amountInput(cents: string | undefined): string {
  if (cents === undefined) return '';
  const negative = cents.startsWith('-'); const digits = (negative ? cents.slice(1) : cents).padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)},${digits.slice(-2)}`;
}
export function centsInput(value: string): string {
  const match = /^(-?)(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Informe o valor em reais, sem separador de milhares.');
  return BigInt(`${match[1]}${match[2]}${(match[3] ?? '').padEnd(2, '0')}`).toString();
}
