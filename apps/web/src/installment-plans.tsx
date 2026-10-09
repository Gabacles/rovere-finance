import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ExpenseDTO } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';

type Api = (path: string, body?: unknown, key?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;
interface Charge { id: string; description: string; postedOn: string; amount: { cents: string }; expenseId: string | null }
export function InstallmentPlans({ value, credits, api, busy, catalogVersion, write }: {
  value: ExpenseDTO; credits: { id: string; name: string }[]; api: Api; busy: boolean; catalogVersion: number;
  write: (path: string, body: unknown, method: 'POST' | 'PATCH', success: string) => Promise<void>;
}) {
  const plan = value.installmentPlan; const total = value.facts.total.state === 'confirmed' ? value.facts.total.value : null;
  const [number, setNumber] = useState(''); const [chargeId, setChargeId] = useState(''); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [charges, setCharges] = useState<{ rows: Charge[]; total: number }>({ rows: [], total: 0 }); const [loading, setLoading] = useState(false); const [message, setMessage] = useState('');
  const forecast = plan?.forecasts.find(row => row.number === Number(number));
  useEffect(() => {
    if (!plan || !forecast) return;
    let active = true; setLoading(true); setChargeId(''); setMessage('');
    void (async () => {
      const statements: { id: string; period: string }[] = await api(`/credit-accounts/${plan.creditAccountId}/statements`);
      const statement = statements.find(row => row.period === forecast.period);
      if (!statement) { if (active) { setCharges({ rows: [], total: 0 }); setMessage('Cadastre esta competência e confirme a importação de suas cobranças para conciliar.'); } return; }
      const result = await api(`/entries?kind=card&accountId=${plan.creditAccountId}&statementId=${statement.id}&page=${page}`);
      if (active) setCharges(result);
    })().catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [plan?.id, number, page, refresh, value.version, catalogVersion]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!total) return; const data = new FormData(event.currentTarget);
    await write(`/expenses/${value.id}/installment-plan`, { expectedVersion: value.version, total, count: Number(data.get('count')), creditAccountId: data.get('creditId'), firstPeriod: data.get('firstPeriod'), cadence: 'monthly' }, 'POST', 'Plano confirmado. Previsões geradas sem criar cobranças efetivas.');
  }
  async function match(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!forecast || !chargeId) return; const data = new FormData(event.currentTarget);
    try { await write(`/expenses/${value.id}/installment-plan/matches`, { expectedVersion: value.version, number: forecast.number, chargeId, confirmedAmount: { currency: 'BRL', cents: centsInput(String(data.get('amount') ?? '')) } }, 'POST', 'Parcela conciliada. Valor original preservado.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Confira o valor.'); }
  }
  const selected = charges.rows.find(charge => charge.id === chargeId);
  return <div className="import-review" aria-busy={busy || loading}>
    <h3>Plano de parcelas</h3>
    {!plan ? <>
      {!total ? <p>Confirme o total da compra para criar um plano. Uma parcela importada não informa o total original.</p> : <>
        <p>Total confirmado: BRL {amountInput(total.cents)}. Informe quantidade, crédito e primeira competência; o calendário será mensal. Valores e competências do plano serão preservados após confirmação.</p>
        <form onSubmit={create}>
          <label>Quantidade de parcelas do plano<input name="count" type="number" required min={1} max={10000} step={1} disabled={busy} /></label>
          <label>Crédito do plano<select name="creditId" required disabled={busy} defaultValue=""><option value="">Selecione um crédito</option>{credits.map(credit => <option value={credit.id} key={credit.id}>{credit.name}</option>)}</select></label>
          <label>Primeira competência do plano<input name="firstPeriod" type="month" min="0001-01" max="9999-12" required disabled={busy} /></label>
          <label className="check"><input type="checkbox" required disabled={busy} />Confirmo o total da compra, a quantidade e o calendário mensal deste plano.</label>
          <button disabled={busy}>Confirmar plano de parcelas</button>
        </form>
      </>}
    </> : <>
      <p data-testid="installment-plan-summary">BRL {amountInput(plan.total.cents)} · {plan.count} parcelas · Primeira competência: {plan.firstPeriod} · {plan.forecasts.filter(row => row.state === 'planned').length} previsões pendentes · {plan.forecasts.filter(row => row.state === 'recorded').length} cobranças conciliadas</p>
      <p>Crédito: {credits.find(credit => credit.id === plan.creditAccountId)?.name ?? 'Crédito do plano'}. Previsto e efetivo são mostrados separadamente; conciliar não significa pagar.</p>
      <div className="import-table"><table aria-label="Parcelas previstas e efetivas"><thead><tr><th>Parcela</th><th>Competência</th><th>Previsto BRL</th><th>Efetivo confirmado BRL</th><th>Diferença BRL</th><th>Situação</th></tr></thead>
        <tbody>{plan.forecasts.map(row => <tr key={row.id}><td>{row.number}/{plan.count}</td><td>{row.period}</td><td>{amountInput(row.plannedAmount.cents)}</td><td>{row.actual ? <>{amountInput(row.actual.confirmedAmount.cents)}<p className="note">Origem: BRL {amountInput(row.actual.charge.amount.cents)} · {row.actual.charge.description}</p></> : 'Não informado'}</td><td>{row.difference ? amountInput(row.difference.cents) : '—'}</td><td>{row.actual ? <><span>Cobrança conciliada</span><br /><button className="secondary" disabled={busy} onClick={() => void write(`/expenses/${value.id}/installment-plan/matches/${row.number}/remove`, { expectedVersion: value.version }, 'POST', 'Parcela desconciliada. Cobrança e vínculo com a compra preservados.')}>Desconciliar parcela {row.number}</button></> : 'Previsão'}</td></tr>)}</tbody>
      </table></div>
      <h4>Conciliar cobrança com previsão</h4>
      <p>Selecione uma cobrança confirmada desta competência e informe a magnitude do valor efetivo em reais. O sinal da origem será preservado.</p>
      {message && <p role="status">{message}</p>}
      <label>Parcela prevista para conciliar<select value={number} disabled={busy} onChange={event => { setNumber(event.target.value); setChargeId(''); setPage(1); setCharges({ rows: [], total: 0 }); setMessage(''); }}><option value="">Selecione uma parcela</option>{plan.forecasts.map(row => <option value={row.number} key={row.id} disabled={Boolean(row.actual)}>{row.number} · {row.period}{row.actual ? ' · Já conciliada' : ''}</option>)}</select></label>
      {forecast && !forecast.actual && <>
        <button className="secondary" disabled={busy || loading} onClick={() => setRefresh(current => current + 1)}>Atualizar cobranças para conciliar</button>
        <form key={`${value.id}:${value.version}:${number}`} onSubmit={match}>
          <label>Cobrança para conciliar<select required value={chargeId} disabled={busy || loading} onChange={event => setChargeId(event.target.value)}><option value="">{loading ? 'Carregando…' : 'Selecione uma cobrança'}</option>{charges.rows.map(charge => <option key={charge.id} value={charge.id} disabled={Boolean(charge.expenseId && charge.expenseId !== value.id) || plan.forecasts.some(row => row.actual?.charge.id === charge.id)}>{charge.postedOn} · {charge.description} · BRL {amountInput(charge.amount.cents)}{charge.expenseId && charge.expenseId !== value.id ? ' · Outra compra' : ''}</option>)}</select></label>
          {selected && <p>Valor na origem: BRL {amountInput(selected.amount.cents)}. Confira o vínculo e informe abaixo o valor efetivo, sem sinal negativo.</p>}
          <label>Valor efetivo confirmado em reais<input name="amount" inputMode="decimal" required disabled={busy || loading} /></label>
          <label className="check"><input type="checkbox" key={`${number}:${chargeId}`} required disabled={busy || loading} />Confirmo a parcela selecionada, o vínculo com esta compra e o valor efetivo informado.</label>
          <button disabled={busy || loading || !chargeId}>Conciliar parcela com cobrança</button>
        </form>
        <nav aria-label="Páginas de cobranças para conciliação"><button className="secondary" disabled={busy || loading || page === 1} onClick={() => setPage(page - 1)}>Página anterior de conciliação</button><span>Página {page} · {charges.total} cobranças</span><button className="secondary" disabled={busy || loading || page * 25 >= charges.total} onClick={() => setPage(page + 1)}>Próxima página de conciliação</button></nav>
      </>}
    </>}
  </div>;
}
