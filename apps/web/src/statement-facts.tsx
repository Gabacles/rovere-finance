import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { KnownValue, StatementDetailsDTO, StatementFacts } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';
import { StatementCalculationPanel } from './statement-calculation';
import { StatementPaymentsPanel } from './statement-payments';

type Api = (path: string, body?: unknown, key?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;
interface History { id: string; version: number; changes: { current: StatementFacts }; createdAt: string }
const known = <T,>(value: KnownValue<T>): T | undefined => value.state === 'confirmed' ? value.value : undefined;
const cycleName = (value: StatementFacts['cycle']): string => value.state === 'unknown' ? 'Não informado' : value.value === 'open' ? 'Aberta' : 'Fechada';

export function StatementFactsPanel({ creditId, statements, api, financialVersion }: { creditId: string; statements: { id: string; period: string }[]; api: Api; financialVersion: number }) {
  const [statementId, setStatementId] = useState(''); const [value, setValue] = useState<StatementDetailsDTO | null>(null);
  const [refresh, setRefresh] = useState(0); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [history, setHistory] = useState<History[] | null>(null);
  useEffect(() => {
    if (!statementId) return;
    let active = true; setValue(null); setHistory(null);
    void api(`/credit-accounts/${creditId}/statements/${statementId}`).then(data => { if (active) setValue(data); })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); });
    return () => { active = false; };
  }, [creditId, statementId, refresh]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!value) return;
    const data = new FormData(event.currentTarget); const facts: Record<string, unknown> = {};
    for (const field of ['closingOn', 'dueOn', 'cycle'] as const) {
      const text = String(data.get(field) ?? ''); if (text !== (known<string>(value.facts[field]) ?? '')) facts[field] = text || null;
    }
    try {
      const text = String(data.get('total') ?? '').trim(); const cents = text ? centsInput(text) : undefined;
      if (cents !== known(value.facts.declaredTotal)?.cents) facts.declaredTotal = cents === undefined ? null : { currency: 'BRL', cents };
      if (!Object.keys(facts).length) { setMessage('Nenhuma alteração informada.'); return; }
      setBusy(true); setMessage('');
      setValue(await api(`/credit-accounts/${creditId}/statements/${statementId}`, { expectedVersion: value.version, facts }, undefined, 'PATCH'));
      setHistory(null); setMessage('Dados da fatura salvos.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }
    finally { setBusy(false); }
  }
  async function showHistory() {
    setBusy(true);
    try { setHistory(await api(`/credit-accounts/${creditId}/statements/${statementId}/history`)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); } finally { setBusy(false); }
  }
  return <section aria-labelledby="statement-facts-title" aria-busy={busy}>
    <h2 id="statement-facts-title">Dados da fatura</h2>
    <p>Informe os dados conhecidos desta competência. Campos em branco permanecem não informados.</p>
    {message && <p role="status">{message}</p>}
    <label>Fatura para editar<select disabled={busy} value={statementId} onChange={event => { setStatementId(event.target.value); setValue(null); setHistory(null); setMessage(''); }}>
      <option value="">Selecione uma competência</option>{statements.map(statement => <option key={statement.id} value={statement.id}>{statement.period}</option>)}
    </select></label>
    {statementId && !value && <p>Carregando dados da fatura…</p>}
    {value && <>
      <div data-testid="statement-facts-summary"><p>Competência: {value.period} · Ciclo: {cycleName(value.facts.cycle)}</p>
        <p>Fechamento informado: {known(value.facts.closingOn) ?? 'Não informado'} · Vencimento informado: {known(value.facts.dueOn) ?? 'Não informado'}</p>
        <p>Total declarado: {value.facts.declaredTotal.state === 'confirmed' ? `BRL ${amountInput(value.facts.declaredTotal.value.cents)}` : 'Não informado'}</p>
      </div>
      <form key={`${value.id}:${value.version}`} onSubmit={event => void save(event)}>
        <label>Fechamento informado<input name="closingOn" type="date" min="0001-01-01" max="9999-12-31" defaultValue={known(value.facts.closingOn) ?? ''} disabled={busy} /></label>
        <label>Vencimento informado<input name="dueOn" type="date" min="0001-01-01" max="9999-12-31" defaultValue={known(value.facts.dueOn) ?? ''} disabled={busy} /></label>
        <label>Total declarado em reais<input name="total" inputMode="decimal" defaultValue={amountInput(known(value.facts.declaredTotal)?.cents)} disabled={busy} aria-describedby="declared-total-hint" /></label>
        <small id="declared-total-hint">BRL, com o sinal informado. Exemplo: 100,00. Esse valor é uma declaração da fatura; as cobranças ficam preservadas.</small>
        <label>Ciclo informado<select name="cycle" defaultValue={known(value.facts.cycle) ?? ''} disabled={busy}><option value="">Não informado</option><option value="open">Aberta</option><option value="closed">Fechada</option></select></label>
        <small>Aberta ou fechada descreve o ciclo. Pagamento e atraso dependem dos registros de liquidação.</small>
        <button type="submit" disabled={busy}>Salvar dados da fatura</button>
      </form>
      <nav aria-label="Revisão dos dados da fatura"><button className="secondary" disabled={busy} onClick={() => { setMessage(''); setRefresh(number => number + 1); }}>Recarregar dados da fatura</button><button className="secondary" disabled={busy} onClick={() => void showHistory()}>Consultar histórico da fatura</button></nav>
      <StatementCalculationPanel key={value.id} creditId={creditId} statementId={statementId} api={api} statementVersion={value.version} parentBusy={busy} setParentBusy={setBusy} onStatementChanged={next => { setValue(next); setHistory(null); }} financialVersion={financialVersion} />
      <StatementPaymentsPanel key={`payments:${value.id}`} creditId={creditId} statementId={statementId} api={api} statementVersion={value.version} financialVersion={financialVersion} parentBusy={busy} setParentBusy={setBusy} onStatementChanged={next => { setValue(next); setHistory(null); }} />
      {history && <div><h3>Últimas 20 alterações</h3>{history.length === 0 ? <p>Nenhuma alteração de dados registrada.</p> : history.map(item => <div className="statement-history" key={item.id}>
        <p>Versão {item.version} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(item.createdAt))}</p>
        <p>Ciclo: {cycleName(item.changes.current.cycle)} · Total declarado: {item.changes.current.declaredTotal.state === 'confirmed' ? `BRL ${amountInput(item.changes.current.declaredTotal.value.cents)}` : 'Não informado'}</p>
        <p>Fechamento: {known(item.changes.current.closingOn) ?? 'Não informado'} · Vencimento: {known(item.changes.current.dueOn) ?? 'Não informado'}</p>
      </div>)}</div>}
    </>}
  </section>;
}
