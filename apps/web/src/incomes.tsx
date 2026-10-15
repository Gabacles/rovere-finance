import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { IncomeDTO, KnownValue } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';
import { IncomeSettlements } from './income-settlements';

type Api = (path: string, body?: unknown, key?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;
interface History { id: string; version: number; changes: { action: string; current: IncomeDTO; settlement?: { current: { progress: { received: { cents: string } } } } }; createdAt: string }
interface Command { path: string; body: unknown; method: 'POST' | 'PATCH'; key: string; success: string }
const known = <T,>(value: KnownValue<T>): T | undefined => value.state === 'confirmed' ? value.value : undefined;
const amount = (value: IncomeDTO) => value.facts.expectedAmount.state === 'confirmed' ? `BRL ${amountInput(value.facts.expectedAmount.value.cents)}` : 'Não informado';
const stateText = (value: IncomeDTO) => value.state === 'cancelled' ? 'Cancelada' : 'Prevista';

export function Incomes({ api, financialVersion }: { api: Api; financialVersion: number }) {
  const [list, setList] = useState<{ rows: IncomeDTO[]; total: number }>({ rows: [], total: 0 }); const [page, setPage] = useState(1);
  const [value, setValue] = useState<IncomeDTO | null>(null); const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0); const [message, setMessage] = useState(''); const [history, setHistory] = useState<History[] | null>(null);
  const [editorRefresh, setEditorRefresh] = useState(0); const pending = useRef<Command | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const showError = (error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha de conexão. Tente novamente.');
  useEffect(() => {
    let active = true;
    void api(`/incomes?page=${page}`).then(data => { if (active) setList(data); }).catch(error => { if (active) showError(error); });
    return () => { active = false; };
  }, [page, refresh, financialVersion]);
  async function execute(command: Command) {
    pending.current = command; setBusy(true); setMessage('');
    try {
      const result: IncomeDTO = await api(command.path, command.body, command.key, command.method);
      // A replay can return an older snapshot. Always refresh the current projection.
      const current: IncomeDTO = await api(`/incomes/${result.id}`);
      setValue(current); setHistory(null); pending.current = null; setRefresh(count => count + 1); setMessage(command.success);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && [400, 401, 403, 404, 409, 413].includes(error.status as number)) pending.current = null;
      showError(error);
    } finally { setBusy(false); }
  }
  function write(path: string, body: unknown, method: Command['method'], success: string) {
    return execute({ path, body, method, success, key: crypto.randomUUID() });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    const data = new FormData(event.currentTarget);
    try {
      const description = String(data.get('description') ?? '').trim(); const notes = String(data.get('notes') ?? '').trim() || null;
      const expectedOn = String(data.get('expectedOn') ?? '') || null; const text = String(data.get('expectedAmount') ?? '').trim();
      const expectedAmount = text ? { currency: 'BRL', cents: centsInput(text) } : null;
      if (!value) { await write('/incomes', { description, notes, facts: { expectedOn, expectedAmount } }, 'POST', 'Previsão cadastrada.'); return; }
      const patch: Record<string, unknown> = {}; const facts: Record<string, unknown> = {};
      if (description !== value.description) patch.description = description;
      if (notes !== value.notes) patch.notes = notes;
      if (expectedOn !== (known(value.facts.expectedOn) ?? null)) facts.expectedOn = expectedOn;
      if ((expectedAmount?.cents ?? null) !== (known(value.facts.expectedAmount)?.cents ?? null)) facts.expectedAmount = expectedAmount;
      if (Object.keys(facts).length) patch.facts = facts;
      if (!Object.keys(patch).length) { setMessage('Nenhuma alteração informada.'); return; }
      await write(`/incomes/${value.id}`, { expectedVersion: value.version, ...patch }, 'PATCH', 'Previsão corrigida.');
    } catch (error) { showError(error); }
  }
  async function open(id: string) {
    setBusy(true); setMessage('');
    try { setValue(await api(`/incomes/${id}`)); setEditorRefresh(count => count + 1); setHistory(null); setRefresh(count => count + 1); }
    catch (error) { showError(error); } finally { setBusy(false); }
  }
  async function showHistory() {
    if (!value) return; setBusy(true);
    try { setHistory(await api(`/incomes/${value.id}/history`)); } catch (error) { showError(error); } finally { setBusy(false); }
  }
  const uncertain = Boolean(pending.current) && !busy; const locked = busy || uncertain || receiptBusy;
  return <section className="planned-incomes" aria-labelledby="incomes-title" aria-busy={busy}>
    <h2 id="incomes-title">Receitas previstas</h2>
    <p>Planeje uma receita avulsa. Data e valor em branco ficam não informados. Previsões não movimentam caixa e não comprovam recebimento.</p>
    {message && <p role="status">{message}</p>}
    {uncertain && <div><p>A resposta não foi confirmada. Seus dados e a chave foram preservados. Recupere o resultado antes de iniciar outra ação.</p><button disabled={busy} onClick={() => pending.current && void execute(pending.current)}>Recuperar resultado da previsão</button></div>}
    <div className="import-list">{list.rows.map(item => <button className="secondary" key={item.id} disabled={locked} onClick={() => void open(item.id)}>Abrir previsão: {item.description} · {stateText(item)}</button>)}</div>
    {list.total > 25 && <nav aria-label="Páginas de receitas previstas"><button disabled={locked || page === 1} onClick={() => setPage(page - 1)}>Previsões anteriores</button><span>Página {page}</span><button disabled={locked || page * 25 >= list.total} onClick={() => setPage(page + 1)}>Próximas previsões</button></nav>}
    <button className="secondary" disabled={locked} onClick={() => { setValue(null); setHistory(null); setMessage(''); setEditorRefresh(count => count + 1); }}>Nova previsão</button>
    {value && <div data-testid="income-summary"><p>{stateText(value)} · {value.description} · {value.origin.kind === 'manual' ? 'Origem manual' : 'Gerada por recorrência'}</p><p>Data prevista: {known(value.facts.expectedOn) ?? 'Não informada'} · Valor esperado: {amount(value)}</p><p>{value.knowledge === 'complete' ? 'Dados completos' : 'Dados parciais'} · Versão {value.version}</p></div>}
    {value?.state !== 'cancelled' && value?.origin.kind !== 'recurrence' && <form key={`${value?.id ?? 'new'}:${value?.version ?? 0}:${editorRefresh}`} onSubmit={save}>
      <label>Descrição da receita prevista<input name="description" required maxLength={500} defaultValue={value?.description ?? ''} disabled={locked} /></label>
      <label>Data prevista da receita<input name="expectedOn" type="date" min="0001-01-01" max="9999-12-31" defaultValue={value ? known(value.facts.expectedOn) ?? '' : ''} disabled={locked} /></label>
      <label>Valor esperado da receita em reais<input name="expectedAmount" inputMode="decimal" placeholder="Não informado" defaultValue={value ? amountInput(known(value.facts.expectedAmount)?.cents) : ''} disabled={locked} /></label>
      <label>Notas da receita prevista<input name="notes" maxLength={1000} defaultValue={value?.notes ?? ''} disabled={locked} /></label>
      <label className="check"><input type="checkbox" required disabled={locked} />Confirmo os dados desta previsão, sem registrar recebimento.</label>
      <button disabled={locked}>{value ? 'Salvar previsão' : 'Cadastrar previsão'}</button>
    </form>}
    {value && <>
      {value.notes && <p>Notas: {value.notes}</p>}
      <nav><button className="secondary" disabled={locked} onClick={() => void open(value.id)}>Recarregar previsão</button><button className="secondary" disabled={locked} onClick={() => void showHistory()}>Consultar histórico da previsão</button></nav>
      {value.origin.kind === 'recurrence' ? <p>Gerada por regra mensal. Revisão e cancelamento estarão disponíveis na entrega de séries.</p> : value.state === 'planned' ? <form key={`cancel:${value.id}:${value.version}`} onSubmit={event => { event.preventDefault(); void write(`/incomes/${value.id}/cancel`, { expectedVersion: value.version }, 'POST', 'Previsão cancelada. Histórico preservado.'); }}>
        <label className="check"><input type="checkbox" required disabled={locked} />Confirmo o cancelamento definitivo desta previsão.</label><button className="secondary" disabled={locked}>Cancelar previsão</button>
      </form> : <p>Cancelamento definitivo. Para planejar outra receita, cadastre uma nova previsão.</p>}
      {history && <div className="statement-history"><h3>Histórico da previsão — últimas 20 alterações</h3>{history.map(item => <p key={item.id}>Versão {item.version} · {item.createdAt} · {item.changes.action === 'allocate' ? 'Recebimento vinculado' : item.changes.action === 'reverse' ? 'Vínculo revertido' : stateText(item.changes.current)} · {item.changes.current.description} · Data prevista: {known(item.changes.current.facts.expectedOn) ?? 'Não informada'} · Valor esperado: {amount(item.changes.current)} · Notas: {item.changes.current.notes ?? 'Não informadas'} · {item.changes.current.origin.kind === 'manual' ? 'Origem manual' : 'Gerada por recorrência'}{item.changes.settlement && ` · Recebido nessa versão: BRL ${amountInput(item.changes.settlement.current.progress.received.cents)}`}</p>)}</div>}
      <IncomeSettlements key={value.id} income={value} api={api} financialVersion={financialVersion} parentBusy={busy || uncertain} setParentBusy={setReceiptBusy} onChanged={current => { setValue(current); setHistory(null); setRefresh(count => count + 1); }} />
    </>}
  </section>;
}
