import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ExpenseDTO, ExpenseFacts, KnownValue } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';
import { InstallmentPlans } from './installment-plans';
import { ExpenseRefunds } from './expense-refunds';

type Api = (path: string, body?: unknown, key?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;
type Summary = Pick<ExpenseDTO, 'id' | 'description' | 'knowledge' | 'version'>;
interface Charge { id: string; description: string; postedOn: string; statementId: string; amount: { cents: string }; expenseId: string | null }
interface History { id: string; version: number; changes: { current: ExpenseDTO }; createdAt: string }
const known = <T,>(value: KnownValue<T>): T | undefined => value.state === 'confirmed' ? value.value : undefined;
const totalText = (facts: ExpenseFacts) => facts.total.state === 'confirmed' ? `BRL ${amountInput(facts.total.value.cents)}` : 'Não informado';

export function Expenses({ api, catalogVersion, financialVersion }: { api: Api; catalogVersion: number; financialVersion: number }) {
  const [list, setList] = useState<{ rows: Summary[]; total: number }>({ rows: [], total: 0 }); const [page, setPage] = useState(1);
  const [id, setId] = useState(''); const [value, setValue] = useState<ExpenseDTO | null>(null); const [busy, setBusy] = useState(false);
  const [editorRefresh, setEditorRefresh] = useState(0);
  const [refresh, setRefresh] = useState(0); const [message, setMessage] = useState(''); const [history, setHistory] = useState<History[] | null>(null);
  const [credits, setCredits] = useState<{ id: string; name: string }[]>([]); const [creditId, setCreditId] = useState('');
  const [statements, setStatements] = useState<{ id: string; period: string }[]>([]); const [statementId, setStatementId] = useState('');
  const [charges, setCharges] = useState<{ rows: Charge[]; total: number }>({ rows: [], total: 0 }); const [chargePage, setChargePage] = useState(1);
  const [chargeId, setChargeId] = useState(''); const [chargeLoading, setChargeLoading] = useState(false);
  // Preserve the key when a response is lost. Changing the command gets a new key.
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const showError = (error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha de conexão. Tente novamente.');
  useEffect(() => {
    let active = true;
    void api(`/expenses?page=${page}`).then(data => { if (active) setList(data); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [page, refresh]);
  useEffect(() => {
    let active = true;
    void api('/credit-accounts').then(data => { if (active) setCredits(data); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [catalogVersion]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void api(`/expenses/${id}`).then(data => { if (active) setValue(data); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [id, financialVersion]);
  useEffect(() => {
    if (!creditId) return;
    let active = true;
    void api(`/credit-accounts/${creditId}/statements`).then(data => { if (active) setStatements(data); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [creditId, catalogVersion]);
  useEffect(() => {
    if (!creditId) return;
    let active = true; setChargeLoading(true); setChargeId('');
    void api(`/entries?kind=card&accountId=${creditId}&page=${chargePage}${statementId ? `&statementId=${statementId}` : ''}`)
      .then(data => { if (active) setCharges(data); }).catch(error => { if (active) showError(error); }).finally(() => { if (active) setChargeLoading(false); });
    return () => { active = false; };
  }, [creditId, statementId, chargePage, refresh]);
  async function write(path: string, body: unknown, method: 'POST' | 'PATCH', success: string) {
    const signature = JSON.stringify({ path, body, method });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      const result = await api(path, body, pending.current.key, method);
      const current = await api(`/expenses/${result.id}`); setId(current.id); setValue(current); setHistory(null);
      pending.current = null; setRefresh(version => version + 1); setMessage(success);
    } catch (error) { showError(error); } finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      const description = String(data.get('description') ?? '').trim(); const notes = String(data.get('notes') ?? '').trim() || null;
      const purchasedOn = String(data.get('purchasedOn') ?? '') || null; const text = String(data.get('total') ?? '').trim();
      const total = text ? { currency: 'BRL', cents: centsInput(text) } : null;
      if (!value) { await write('/expenses', { description, notes, facts: { purchasedOn, total } }, 'POST', 'Compra cadastrada.'); return; }
      const patch: Record<string, unknown> = {}; const facts: Record<string, unknown> = {};
      if (description !== value.description) patch.description = description;
      if (notes !== value.notes) patch.notes = notes;
      if (purchasedOn !== (known(value.facts.purchasedOn) ?? null)) facts.purchasedOn = purchasedOn;
      if ((total?.cents ?? null) !== (known(value.facts.total)?.cents ?? null)) facts.total = total;
      if (Object.keys(facts).length) patch.facts = facts;
      if (!Object.keys(patch).length) { setMessage('Nenhuma alteração informada.'); return; }
      await write(`/expenses/${id}`, { expectedVersion: value.version, ...patch }, 'PATCH', 'Compra salva.');
    } catch (error) { showError(error); }
  }
  async function associate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!value || !chargeId) return;
    await write(`/expenses/${id}`, { expectedVersion: value.version, association: { action: 'link', chargeId } }, 'PATCH', 'Cobrança associada. Dados originais da compra preservados.');
    setChargeId('');
  }
  async function reload() {
    setBusy(true);
    try { setValue(await api(`/expenses/${id}`)); setEditorRefresh(current => current + 1); setHistory(null); setRefresh(version => version + 1); setMessage('Compra recarregada.'); }
    catch (error) { showError(error); } finally { setBusy(false); }
  }
  async function showHistory() {
    setBusy(true);
    try { setHistory(await api(`/expenses/${id}/history`)); } catch (error) { showError(error); } finally { setBusy(false); }
  }
  const disabled = busy || Boolean(id && !value);
  return <section aria-labelledby="expenses-title" aria-busy={busy}>
    <h2 id="expenses-title">Compras</h2>
    <p>Registre o que você conhece da compra. Data original e total em branco permanecem não informados. Cobranças importadas podem ser associadas depois.</p>
    {message && <p role="status">{message}</p>}
    <div className="import-list">{list.rows.map(item => <button className="secondary" key={item.id} disabled={busy} onClick={() => { if (item.id === id) { void reload(); return; } setId(item.id); setValue(null); setHistory(null); setMessage(''); }}>Abrir compra: {item.description}</button>)}</div>
    {list.total > 25 && <nav aria-label="Páginas de compras"><button className="secondary" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>Compras anteriores</button><span>Página {page}</span><button className="secondary" disabled={busy || page * 25 >= list.total} onClick={() => setPage(page + 1)}>Próximas compras</button></nav>}
    <button className="secondary" disabled={busy} onClick={() => { setId(''); setValue(null); setHistory(null); setMessage(''); }}>Nova compra</button>
    {id && !value ? <><p>Carregando compra…</p><button className="secondary" disabled={busy} onClick={() => void reload()}>Recarregar compra e cobranças</button></> : <>
      <h3>{value ? 'Editar compra' : 'Cadastrar compra'}</h3>
      {value && <div data-testid="expense-summary"><p>{value.knowledge === 'complete' ? 'Dados completos' : 'Dados parciais'} · {value.description}</p><p>Data original: {known(value.facts.purchasedOn) ?? 'Não informada'} · Total da compra: {totalText(value.facts)}</p><p>{value.charges.length} cobranças associadas. Total informado não representa pagamento ou cobertura pelas cobranças.</p></div>}
      <form key={value ? `${value.id}:${value.version}:${editorRefresh}` : 'new-expense'} onSubmit={save}>
        <label>Descrição da compra<input name="description" required maxLength={500} defaultValue={value?.description ?? ''} disabled={disabled} /></label>
        <label>Data original da compra<input name="purchasedOn" type="date" min="0001-01-01" max="9999-12-31" defaultValue={value ? known(value.facts.purchasedOn) ?? '' : ''} disabled={disabled} /></label>
        <label>Total da compra em reais<input name="total" inputMode="decimal" placeholder="Não informado" defaultValue={value ? amountInput(known(value.facts.total)?.cents) : ''} disabled={disabled} /></label>
        <label>Notas da compra<input name="notes" maxLength={1000} defaultValue={value?.notes ?? ''} disabled={disabled} /></label>
        <button disabled={disabled}>{value ? 'Salvar compra' : 'Cadastrar compra'}</button>
      </form>
    </>}
    {value && <>
      <nav><button className="secondary" disabled={busy} onClick={() => void reload()}>Recarregar compra e cobranças</button><button className="secondary" disabled={busy} onClick={() => void showHistory()}>Consultar histórico da compra</button></nav>
      <h3>Cobranças desta compra</h3>
      <ul data-testid="expense-charges">{value.charges.map(charge => <li key={charge.id}>{charge.postedOn} · {charge.description} · BRL {amountInput(charge.amount.cents)}<br /><button className="secondary" disabled={busy} onClick={() => void write(`/expenses/${id}`, { expectedVersion: value.version, association: { action: 'unlink', chargeId: charge.id } }, 'PATCH', 'Cobrança desassociada; registro financeiro preservado.')}>Desassociar cobrança: {charge.description}</button></li>)}</ul>
      <h3>Associar cobrança já registrada</h3>
      <p>Selecione uma cobrança confirmada. A associação preserva valores, parcelas e competência; não deduz total ou data original.</p>
      <label>Crédito para associar cobrança<select disabled={busy} value={creditId} onChange={event => { setCreditId(event.target.value); setStatements([]); setStatementId(''); setCharges({ rows: [], total: 0 }); setChargeId(''); setChargePage(1); }}><option value="">Selecione um crédito</option>{credits.map(credit => <option key={credit.id} value={credit.id}>{credit.name}</option>)}</select></label>
      {creditId && <>
        <label>Competência para associar cobrança<select disabled={busy} value={statementId} onChange={event => { setStatementId(event.target.value); setChargeId(''); setChargePage(1); }}><option value="">Todas as competências</option>{statements.map(statement => <option key={statement.id} value={statement.id}>{statement.period}</option>)}</select></label>
        <form onSubmit={associate}>
          <label>Cobrança para associar<select value={chargeId} disabled={busy || chargeLoading} required onChange={event => setChargeId(event.target.value)}><option value="">{chargeLoading ? 'Carregando…' : 'Selecione uma cobrança'}</option>{charges.rows.map(charge => <option key={charge.id} value={charge.id} disabled={Boolean(charge.expenseId)}>{charge.postedOn} · {charge.description} · BRL {amountInput(charge.amount.cents)}{charge.expenseId ? ' · Já associada' : ''}</option>)}</select></label>
          <label className="check"><input type="checkbox" required disabled={busy || chargeLoading} key={`${id}:${value.version}:${chargeId}`} />Confirmo que a cobrança selecionada pertence a esta compra.</label>
          <button disabled={busy || chargeLoading || !chargeId}>Associar cobrança à compra</button>
        </form>
        <nav aria-label="Páginas de cobranças para associação"><button className="secondary" disabled={busy || chargeLoading || chargePage === 1} onClick={() => setChargePage(chargePage - 1)}>Cobranças anteriores</button><span>Página {chargePage} · {charges.total} cobranças registradas</span><button className="secondary" disabled={busy || chargeLoading || chargePage * 25 >= charges.total} onClick={() => setChargePage(chargePage + 1)}>Próximas cobranças</button></nav>
      </>}
      <InstallmentPlans key={value.id} value={value} credits={credits} api={api} busy={busy} catalogVersion={catalogVersion} write={write} />
      <ExpenseRefunds key={`refunds:${value.id}`} value={value} credits={credits} api={api} financialVersion={financialVersion} parentBusy={busy} setParentBusy={setBusy} onChanged={next => { setValue(next); setHistory(null); setRefresh(current => current + 1); }} />
      {history && <div className="statement-history"><h3>Histórico da compra — últimas 20 alterações</h3>{history.map(item => <p key={item.id}>Versão {item.version} · {item.createdAt} · {item.changes.current.description} · Data original: {known(item.changes.current.facts.purchasedOn) ?? 'Não informada'} · Total: {totalText(item.changes.current.facts)} · {item.changes.current.charges.length} cobranças · Plano: {item.changes.current.installmentPlan ? `${item.changes.current.installmentPlan.count} parcelas, ${item.changes.current.installmentPlan.forecasts.filter(row => row.actual).length} conciliadas` : 'Não informado nesta versão'}</p>)}</div>}
    </>}
  </section>;
}
