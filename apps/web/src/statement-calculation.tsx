import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CARD_NATURES } from '@rovere/domain';
import type { AmountResult, CardClassification, CardNature, KnownValue, StatementDetailsDTO, StatementSummaryDTO } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';
type Api = (path: string, body?: unknown, key?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;
interface Line { id: string; version: number; description: string; postedOn: string; amount: { cents: string }; classification: KnownValue<CardClassification> }
const natureNames: Record<CardNature, string> = { purchase: 'Compra', fee: 'Tarifa', interest: 'Juros informados', refund: 'Estorno', other_credit: 'Outro crédito', other_debit: 'Outro débito', previous_balance: 'Saldo anterior', payment: 'Pagamento informado', informational: 'Informação sem efeito' };
const moneyText = (value: AmountResult | { state: 'unknown' | 'incomplete' }) => value.state === 'available' ? `BRL ${amountInput(value.amount.cents)}` : value.state === 'overflow' ? 'Valor excede o intervalo suportado' : 'Não disponível';

export function StatementCalculationPanel({ creditId, statementId, api, statementVersion, parentBusy, setParentBusy, onStatementChanged, financialVersion }: {
  creditId: string; statementId: string; api: Api; statementVersion: number; parentBusy: boolean; setParentBusy: (busy: boolean) => void; onStatementChanged: (value: StatementDetailsDTO) => void; financialVersion: number;
}) {
  const [summary, setSummary] = useState<StatementSummaryDTO | null>(null); const [rows, setRows] = useState<Line[]>([]); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [refresh, setRefresh] = useState(0); const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Line | null>(null); const [nature, setNature] = useState(''); const [editorRefresh, setEditorRefresh] = useState(0);
  const [history, setHistory] = useState<{ id: string; version: number; changes: { current: Line }; createdAt: string }[] | null>(null);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const path = `/credit-accounts/${creditId}/statements/${statementId}`; const disabled = busy || parentBusy || loading;
  useEffect(() => {
    let active = true; setLoading(true);
    void Promise.all([api(`${path}/summary`), api(`/entries?kind=card&accountId=${creditId}&statementId=${statementId}&page=${page}`)])
      .then(([value, list]) => { if (active) { setSummary(value); setRows(list.rows); } }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [creditId, statementId, page, refresh, statementVersion, financialVersion]);
  function choose(line: Line) { setSelected(line); setNature(line.classification.state === 'confirmed' ? line.classification.value.nature : ''); setEditorRefresh(value => value + 1); setHistory(null); setMessage(''); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const data = new FormData(event.currentTarget);
    try {
      const classification = nature ? { nature, amount: { currency: 'BRL', cents: centsInput(String(data.get('amount') ?? '')) } } : null;
      const body = { expectedVersion: selected.version, classification }; const signature = JSON.stringify({ id: selected.id, body });
      if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
      setBusy(true); setParentBusy(true); setMessage('');
      await api(`/card-charges/${selected.id}/classification`, body, pending.current.key, 'PATCH');
      choose(await api(`/card-charges/${selected.id}`)); pending.current = null; setRefresh(value => value + 1); setMessage('Natureza salva. Dados originais preservados; confira a cobertura.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); } finally { setBusy(false); setParentBusy(false); }
  }
  async function coverage(value: 'complete' | 'partial' | null) {
    if (!summary) return; setBusy(true); setParentBusy(true); setMessage('');
    try { onStatementChanged(await api(path, { expectedVersion: summary.statementVersion, facts: { coverage: value } }, undefined, 'PATCH')); setRefresh(current => current + 1); setMessage('Cobertura registrada.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); } finally { setBusy(false); setParentBusy(false); }
  }
  async function reloadLine(showHistory = false) {
    if (!selected) return; setBusy(true); setParentBusy(true);
    try { if (showHistory) setHistory(await api(`/card-charges/${selected.id}/history`)); else { choose(await api(`/card-charges/${selected.id}`)); setRefresh(value => value + 1); } }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); } finally { setBusy(false); setParentBusy(false); }
  }
  return <div className="import-review" aria-busy={disabled}>
    <h3>Registros e total calculado da fatura</h3>
    <p>Classifique as linhas e confirme se todos os registros desta competência foram conferidos. Subtotal de registros incompletos não representa a fatura inteira.</p>
    {message && <p role="status">{message}</p>}
    <button className="secondary" disabled={disabled} onClick={() => { setRefresh(value => value + 1); setMessage(''); }}>Atualizar registros e cálculo da fatura</button>
    {summary && <>
      <div data-testid="statement-calculation-summary"><p>{summary.recordCount} registros · {summary.unclassifiedCount} sem natureza confirmada</p>
        <p>Cobertura: {summary.facts.coverage.state === 'unknown' ? 'Não informada' : summary.facts.coverage.value === 'partial' ? 'Parcial' : summary.coverageCurrent ? 'Completa e atual' : 'Confirmação desatualizada; confira novamente'}</p>
        <p>Subtotal conhecido do ciclo: {moneyText(summary.knownSubtotal)}</p><p>Total calculado completo: {moneyText(summary.calculatedTotal)}</p>
        <p>Total declarado: {summary.facts.declaredTotal.state === 'confirmed' ? `BRL ${amountInput(summary.facts.declaredTotal.value.cents)}` : 'Não informado'}</p>
        <p>Diferença (declarado − calculado): {moneyText(summary.difference)} · {summary.comparison === 'equal' ? 'Valores coincidem' : summary.comparison === 'different' ? 'Divergência para revisão' : 'Comparação pendente'}</p>
        <p>Consumo bruto informado: {moneyText(summary.consumptionGross)} · Pagamentos informados: {moneyText(summary.reportedPayments)}</p>
      </div>
      <p className="note">Saldo anterior e créditos aparecem separados do consumo. Pagamentos informados não alteram este total antes de liquidações; pagamento bancário e saldo restante serão tratados nas alocações.</p>
      <details><summary>Subtotais por natureza</summary><ul>{CARD_NATURES.map(key => <li key={key}>{natureNames[key]}: {summary.groups[key].count} linhas · {moneyText(summary.groups[key].total)}</li>)}</ul></details>
      <form key={`coverage:${summary.statementVersion}:${refresh}`} onSubmit={event => { event.preventDefault(); void coverage('complete'); }}>
        <label className="check"><input type="checkbox" required disabled={disabled || summary.unclassifiedCount > 0} />Conferi que todos os registros desta fatura estão presentes e têm natureza confirmada.</label>
        <button disabled={disabled || summary.unclassifiedCount > 0}>Confirmar cobertura completa dos registros atuais</button>
      </form>
      <nav><button className="secondary" disabled={disabled} onClick={() => void coverage('partial')}>Marcar cobertura parcial</button><button className="secondary" disabled={disabled} onClick={() => void coverage(null)}>Retirar declaração de cobertura</button></nav>
      <div className="import-table"><table aria-label="Natureza dos registros da fatura"><thead><tr><th>Data de origem</th><th>Descrição</th><th>Valor original BRL</th><th>Natureza confirmada</th><th>Revisão</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.postedOn}</td><td>{row.description}</td><td>{amountInput(row.amount.cents)}</td><td>{row.classification.state === 'confirmed' ? natureNames[row.classification.value.nature] : 'Não informada'}</td><td><button className="secondary" disabled={disabled} onClick={() => choose(row)}>Classificar: {row.description}</button></td></tr>)}</tbody></table></div>
      <nav aria-label="Páginas da classificação"><button className="secondary" disabled={disabled || page === 1} onClick={() => setPage(page - 1)}>Classificação anterior</button><span>Página {page}</span><button className="secondary" disabled={disabled || page * 25 >= summary.recordCount} onClick={() => setPage(page + 1)}>Próxima classificação</button></nav>
    </>}
    {selected && <div className="row-editor"><h4>Classificar {selected.description}</h4><p>Valor original: BRL {amountInput(selected.amount.cents)} · Data original: {selected.postedOn}. Informe a magnitude sem sinal; a origem será preservada.</p>
      <form key={`${selected.id}:${selected.version}:${editorRefresh}`} onSubmit={save}>
        <label>Natureza confirmada da linha<select value={nature} onChange={event => setNature(event.target.value)} disabled={disabled}><option value="">Não informada (retirar afirmação)</option>{CARD_NATURES.map(key => <option key={key} value={key}>{natureNames[key]}</option>)}</select></label>
        <label>Magnitude confirmada em reais<input name="amount" inputMode="decimal" required={Boolean(nature)} disabled={disabled || !nature} defaultValue={selected.classification.state === 'confirmed' ? amountInput(selected.classification.value.amount.cents) : ''} /></label>
        <label className="check"><input type="checkbox" required disabled={disabled} key={nature} />Confirmo a natureza e o valor informados, preservando os dados originais.</label>
        <button disabled={disabled}>Salvar natureza da linha</button>
      </form>
      <nav><button className="secondary" disabled={disabled} onClick={() => void reloadLine()}>Recarregar cobrança para classificar</button><button className="secondary" disabled={disabled} onClick={() => void reloadLine(true)}>Histórico da natureza da linha</button></nav>
      {history && <div><h4>Últimas 20 classificações</h4>{history.map(item => <p key={item.id}>Versão {item.version} · {item.createdAt} · {item.changes.current.classification.state === 'confirmed' ? `${natureNames[item.changes.current.classification.value.nature]} · BRL ${amountInput(item.changes.current.classification.value.amount.cents)}` : 'Natureza não informada'}</p>)}</div>}
    </div>}
  </div>;
}
