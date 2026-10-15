import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { BankSourceDTO, IncomeDTO, IncomeReceiptProgress } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';

type Api = (path: string, body?: unknown, key?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;
interface Allocation { id: string; bankEntryId: string; amount: { cents: string }; postedOn: string; description: string; reversedAt: string | null }
interface Result { income: IncomeDTO; progress: IncomeReceiptProgress; allocations: { page: number; total: number; rows: Allocation[] } }
interface Command { target: string; body: unknown; key: string; success: string }
const stateText: Record<IncomeReceiptProgress['state'], string> = { unknown: 'Previsto não informado', unreceived: 'Sem recebimento vinculado', partial: 'Parcialmente recebida', received: 'Recebida pelas alocações', no_expected_amount: 'Valor previsto zero; sem recebimento presumido', cancelled: 'Previsão cancelada', review_required: 'Revisão necessária' };
const amountText = (value: IncomeReceiptProgress['pending']) => value.state === 'available' ? `BRL ${amountInput(value.amount.cents)}` : 'Não conhecido';

export function IncomeSettlements({ income, api, financialVersion, parentBusy, setParentBusy, onChanged }: {
  income: IncomeDTO; api: Api; financialVersion: number; parentBusy: boolean; setParentBusy: (value: boolean) => void; onChanged: (income: IncomeDTO) => void;
}) {
  const path = `/incomes/${income.id}/settlements`; const [value, setValue] = useState<Result | null>(null); const [refresh, setRefresh] = useState(0); const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [message, setMessage] = useState('');
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]); const [accountId, setAccountId] = useState(''); const [entryId, setEntryId] = useState(''); const [bankPage, setBankPage] = useState(1);
  const [entries, setEntries] = useState<{ rows: { id: string; description: string; postedOn: string; amount: { cents: string } }[]; total: number }>({ rows: [], total: 0 });
  const [source, setSource] = useState<BankSourceDTO | null>(null); const [sourceLoading, setSourceLoading] = useState(false); const [reverseId, setReverseId] = useState('');
  const pending = useRef<Command | null>(null); const showError = (error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha de conexão.');
  useEffect(() => {
    if (pending.current) return;
    let active = true; setLoading(true);
    void Promise.all([api(`${path}?page=${page}`), api('/accounts')]).then(([data, list]) => { if (active) { setValue(data); setAccounts(list); } }).catch(error => { if (active) showError(error); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [income.id, income.version, page, refresh, financialVersion]);
  useEffect(() => {
    if (!accountId || pending.current) return; let active = true; setSourceLoading(true);
    void api(`/entries?kind=bank&accountId=${accountId}&page=${bankPage}`).then(data => { if (active) setEntries(data); }).catch(error => { if (active) showError(error); }).finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [accountId, bankPage, refresh, financialVersion]);
  useEffect(() => {
    if (!entryId || pending.current) return; let active = true; setSourceLoading(true); setSource(null);
    void api(`/bank-entries/${entryId}/settlement-source`).then(data => { if (active) setSource(data); }).catch(error => { if (active) showError(error); }).finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [entryId, refresh, financialVersion]);
  async function execute(command: Command) {
    pending.current = command; setBusy(true); setParentBusy(true); setMessage('');
    try {
      await api(command.target, command.body, command.key);
      const current: Result = await api(path); setValue(current); onChanged(current.income);
      if (entryId) setSource(await api(`/bank-entries/${entryId}/settlement-source`));
      pending.current = null; setReverseId(''); setRefresh(count => count + 1); setMessage(command.success);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && [400, 401, 403, 404, 409, 413].includes(error.status as number)) pending.current = null;
      showError(error);
    } finally { setBusy(false); setParentBusy(Boolean(pending.current)); }
  }
  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!value || !source || pending.current) return; const data = new FormData(event.currentTarget);
    try { await execute({ target: path, key: crypto.randomUUID(), success: 'Recebimento vinculado. Movimento original preservado.', body: {
      expectedVersion: value.income.version, bankEntryId: source.id, expectedBankVersion: source.version,
      confirmedInflow: { currency: 'BRL', cents: centsInput(String(data.get('inflow') ?? '')) }, inflowConfirmed: true,
      amount: { currency: 'BRL', cents: centsInput(String(data.get('amount') ?? '')) } } }); } catch (error) { showError(error); }
  }
  async function reverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const row = value?.allocations.rows.find(item => item.id === reverseId); if (!row || !value || pending.current) return;
    setBusy(true); setParentBusy(true);
    try {
      const bank: BankSourceDTO = await api(`/bank-entries/${row.bankEntryId}/settlement-source`);
      await execute({ target: `${path}/${row.id}/reverse`, key: crypto.randomUUID(), success: 'Vínculo revertido. Reserva liberada; não houve estorno de caixa.', body: { expectedVersion: value.income.version, expectedBankVersion: bank.version, reversalConfirmed: true } });
    } catch (error) { showError(error); } finally { setBusy(false); setParentBusy(Boolean(pending.current)); }
  }
  async function reload() {
    setBusy(true); setParentBusy(true);
    try { const current = await api(path); setValue(current); onChanged(current.income); setRefresh(count => count + 1); setMessage('Receita e movimentos atualizados. Revise a decisão antes de confirmar.'); }
    catch (error) { showError(error); } finally { setBusy(false); setParentBusy(false); }
  }
  const uncertain = Boolean(pending.current) && !busy; const disabled = busy || loading || sourceLoading || parentBusy || uncertain;
  const allocatable = value && income.state === 'planned' && ['unreceived', 'partial'].includes(value.progress.state) && (!source?.confirmation || source.confirmation.direction === 'inflow' && source.current);
  return <div className="import-review" aria-busy={busy || loading || sourceLoading}>
    <h3>Recebimentos vinculados</h3><p>Selecione uma entrada já importada e confirme o destino. Vincular não cria novo caixa. Excedentes permanecem sem alocação até corrigir a previsão ou escolher outro destino.</p>
    {message && <p role="status">{message}</p>}
    {uncertain && <div><p>A resposta não foi confirmada. Corpo e chave foram preservados; recupere o resultado antes de outra ação.</p><button disabled={busy} onClick={() => pending.current && void execute(pending.current)}>Recuperar resultado do recebimento</button></div>}
    <button className="secondary" disabled={disabled} onClick={() => void reload()}>Atualizar receita e movimentos</button>
    {value && <>
      <div data-testid="income-receipts-summary"><p>{stateText[value.progress.state]}</p><p>Previsto: {value.income.facts.expectedAmount.state === 'confirmed' ? `BRL ${amountInput(value.income.facts.expectedAmount.value.cents)}` : 'Não informado'} · Recebido vinculado: BRL {amountInput(value.progress.received.cents)}</p><p>Pendente: {amountText(value.progress.pending)} · Diferença (recebido − previsto): {amountText(value.progress.difference)}</p></div>
      <label>Conta bancária do recebimento<select value={accountId} disabled={disabled} onChange={event => { setAccountId(event.target.value); setBankPage(1); setEntryId(''); setSource(null); setEntries({ rows: [], total: 0 }); }}><option value="">Selecione uma conta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      {accountId && <><label>Movimento bancário do recebimento<select value={entryId} disabled={disabled} onChange={event => { setEntryId(event.target.value); setSource(null); }}><option value="">Selecione um movimento confirmado</option>{entries.rows.map(row => <option key={row.id} value={row.id}>{row.postedOn} · {row.description} · BRL {amountInput(row.amount.cents)}</option>)}</select></label><nav aria-label="Páginas de movimentos para receita"><button disabled={disabled || bankPage === 1} onClick={() => { setBankPage(bankPage - 1); setEntryId(''); setSource(null); }}>Movimentos anteriores da receita</button><span>Página {bankPage}</span><button disabled={disabled || bankPage * 25 >= entries.total} onClick={() => { setBankPage(bankPage + 1); setEntryId(''); setSource(null); }}>Próximos movimentos da receita</button></nav></>}
      {source && <>
        <p data-testid="income-source-summary">Data efetiva: {source.postedOn} · Original: BRL {amountInput(source.amount.cents)} · Direção: {source.confirmation ? source.confirmation.direction === 'inflow' ? 'Entrada confirmada' : 'Saída confirmada' : 'Não confirmada'} · Reservado: BRL {amountInput(source.allocated.cents)} · Disponível do movimento: {amountText(source.available)}</p>
        <form key={`${source.id}:${source.version}:${value.income.version}`} onSubmit={allocate}>
          <label>Magnitude integral da entrada em reais<input name="inflow" inputMode="decimal" required disabled={disabled} /></label>
          <label>Valor recebido a vincular em reais<input name="amount" inputMode="decimal" required disabled={disabled} /></label>
          <label className="check"><input type="checkbox" required disabled={disabled} />Confirmo que o movimento é entrada e o valor escolhido pertence a esta receita.</label>
          <button disabled={disabled || !allocatable}>Vincular recebimento</button>
        </form>
      </>}
      <h4>Associações registradas</h4><ul data-testid="income-receipt-allocations">{value.allocations.rows.map(row => <li key={row.id}>{row.postedOn} · {row.description} · BRL {amountInput(row.amount.cents)} · {row.reversedAt ? 'Revertida' : 'Ativa'}{!row.reversedAt && <button className="secondary" disabled={disabled} onClick={() => setReverseId(row.id)}>Revisar reversão de BRL {amountInput(row.amount.cents)}</button>}</li>)}</ul>
      {reverseId && <form key={reverseId} onSubmit={reverse}><label className="check"><input type="checkbox" required disabled={disabled} />Confirmo reverter somente o vínculo selecionado, sem estornar o movimento bancário.</label><button disabled={disabled}>Confirmar reversão do recebimento</button></form>}
      <nav aria-label="Páginas de recebimentos"><button disabled={disabled || page === 1} onClick={() => setPage(page - 1)}>Recebimentos anteriores</button><span>Página {page}</span><button disabled={disabled || page * 25 >= value.allocations.total} onClick={() => setPage(page + 1)}>Próximos recebimentos</button></nav>
    </>}
  </div>;
}
