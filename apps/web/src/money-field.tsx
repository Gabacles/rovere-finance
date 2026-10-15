import { useId, useState } from 'react';
import { parseCents } from '@rovere/domain';
import { centsInput } from './money-input';

/** Input validation only; domain/server remain authoritative for financial decisions. */
export function MoneyField({ label, name, defaultValue = '', disabled = false, required = false }: { label: string; name: string; defaultValue?: string; disabled?: boolean; required?: boolean }) {
  const id = useId(); const [error, setError] = useState('');
  return <div><label htmlFor={id}>{label}</label><input id={id} name={name} defaultValue={defaultValue} inputMode="decimal" required={required} disabled={disabled}
    pattern="[0-9]+([,.][0-9]{1,2})?" title="Valor não negativo em reais, com até duas casas decimais, sem separador de milhares." aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`}
    onChange={event => { let message = ''; try { const value = event.target.value; if (value || required) { const cents = parseCents(centsInput(value)); if (cents < 0n) throw new Error(); } } catch { message = 'Informe um valor não negativo em reais, com até duas casas decimais e sem separador de milhares.'; } event.target.setCustomValidity(message); setError(message); }} />
    <small id={`${id}-hint`}>{error || 'Exemplo: 1250,50. Use vírgula ou ponto para os centavos; não use separador de milhares.'}</small>
  </div>;
}
