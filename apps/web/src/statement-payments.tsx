import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { BankPaymentSourceDTO, PaymentBasisKind, PaymentState, StatementDetailsDTO, StatementPaymentsDTO } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';
type Api = (path: string, body?: unknown, key?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;
const stateName: Record<PaymentState, string> = { unknown: 'Base não confirmada', unpaid: 'Não pago', partial: 'Parcialmente pago', paid: 'Pago pelas alocações', no_obligation: 'Sem obrigação', review_required: 'Revisão necessária' };
const remaining = (value: StatementPaymentsDTO['progress']['remaining']) => value.state === 'available' ? `BRL ${amountInput(value.amount.cents)}` : 'Não conhecido';
export function StatementPaymentsPanel({ creditId, statementId, api, statementVersion, financialVersion, parentBusy, setParentBusy, onStatementChanged }: {
  creditId: string; statementId: string; api: Api; statementVersion: number; financialVersion: number; parentBusy: boolean; setParentBusy: (busy: boolean) => void; onStatementChanged: (value: StatementDetailsDTO) => void;
}) {
  const [value, setValue] = useState<StatementPaymentsDTO | null>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [message, setMessage] = useState(''); const [refresh, setRefresh] = useState(0); const [page, setPage] = useState(1);
  const [kind, setKind] = useState(''); const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]); const [accountId, setAccountId] = useState(''); const [entryId, setEntryId] = useState('');
  const [entries, setEntries] = useState<{ rows: { id: string; description: string; postedOn: string; amount: { cents: string } }[]; total: number }>({ rows: [], total: 0 }); const [bankPage, setBankPage] = useState(1); const [entry, setEntry] = useState<BankPaymentSourceDTO | null>(null); const [sourceLoading, setSourceLoading] = useState(false);
  const [history, setHistory] = useState<{ id: string; createdAt: string; changes: { request: { decision: { operation: string } }; current: { statement: StatementPaymentsDTO } } }[] | null>(null);
  const pending = useRef<{ signature: string; key: string } | null>(null); const path = `/credit-accounts/${creditId}/statements/${statementId}/payments`; const disabled = busy || parentBusy || loading || sourceLoading;
  const errorMessage = (error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha de conexão.');
  useEffect(() => {
    let active = true; setLoading(true);
    void Promise.all([api(`${path}?page=${page}`), api('/accounts')]).then(([data, list]) => { if (active) { setValue(data); setAccounts(list); } }).catch(error => { if (active) errorMessage(error); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [creditId, statementId, page, refresh, statementVersion, financialVersion]);
  useEffect(() => {
    if (!accountId) return; let active = true; setSourceLoading(true);
    void api(`/entries?kind=bank&accountId=${accountId}&page=${bankPage}`).then(data => { if (active) setEntries(data); }).catch(error => { if (active) errorMessage(error); }).finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [accountId, bankPage, refresh, financialVersion]);
  useEffect(() => {
    if (!entryId) return; let active = true; setSourceLoading(true); setEntry(null);
    void api(`/bank-entries/${entryId}/payment-source`).then(data => { if (active) setEntry(data); }).catch(error => { if (active) errorMessage(error); }).finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [entryId, refresh, financialVersion]);
  async function write(target: string, body: unknown, success: string) {
    const signature = JSON.stringify({ target, body }); if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setParentBusy(true); setMessage('');
    try { await api(target, body, pending.current.key); setValue(await api(path)); if (entryId) setEntry(await api(`/bank-entries/${entryId}/payment-source`)); onStatementChanged(await api(`/credit-accounts/${creditId}/statements/${statementId}`)); pending.current = null; setHistory(null); setRefresh(current => current + 1); setMessage(success); }
    catch (error) { errorMessage(error); } finally { setBusy(false); setParentBusy(false); }
  }
  async function confirmBasis(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const candidate = value?.candidates[kind as PaymentBasisKind]; if (!value || !candidate) return; await write(`${path}/basis`, { expectedStatementVersion: value.statementVersion, kind, referenceHash: candidate.referenceHash, beforePaymentsConfirmed: true, independentObligationConfirmed: true }, 'Base da obrigação confirmada.'); }
  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!value || !entry) return; const data = new FormData(event.currentTarget);
    try { await write(path, { expectedStatementVersion: value.statementVersion, bankEntryId: entry.id, expectedBankVersion: entry.version, confirmedOutflow: { currency: 'BRL', cents: centsInput(String(data.get('outflow') ?? '')) }, outflowConfirmed: true, amount: { currency: 'BRL', cents: centsInput(String(data.get('amount') ?? '')) } }, 'Pagamento alocado. Movimento e consumo originais preservados.'); } catch (error) { errorMessage(error); }
  }
  async function reverse(id: string, bankEntryId: string) {
    if (!value) return; setBusy(true); setParentBusy(true);
    try { const source = await api(`/bank-entries/${bankEntryId}/payment-source`); await write(`${path}/${id}/reverse`, { expectedStatementVersion: value.statementVersion, expectedBankVersion: source.version }, 'Alocação revertida. Reserva liberada; movimento e histórico preservados.'); }
    catch (error) { errorMessage(error); } finally { setBusy(false); setParentBusy(false); }
  }
  async function showHistory() { setBusy(true); setParentBusy(true); try { setHistory(await api(`${path}/history`)); } catch (error) { errorMessage(error); } finally { setBusy(false); setParentBusy(false); } }
  return <div className="import-review" aria-busy={disabled}>
    <h3>Pagamentos e alocações da fatura</h3><p>Escolha uma base antes de pagamentos e vincule saídas bancárias confirmadas. Alocar não cria nova despesa ou outro movimento de caixa.</p>
    {message && <p role="status">{message}</p>}<button className="secondary" disabled={disabled} onClick={() => { setRefresh(current => current + 1); setMessage(''); }}>Atualizar pagamentos e movimentos</button>
    {value && <>
      <div data-testid="statement-payment-summary"><p>Estado: {stateName[value.progress.state]}</p><p>Base confirmada: {value.basis ? `${value.basis.kind === 'declared' ? 'Declarada' : 'Calculada'} · BRL ${amountInput(value.basis.total.cents)}` : 'Não informada'}</p><p>Alocações ativas: BRL {amountInput(value.progress.allocated.cents)} · Saldo conhecido: {remaining(value.progress.remaining)}</p></div>
      {value.blockers.length > 0 && <p role="status">{value.blockers.includes('PREVIOUS_BALANCE_REVIEW_REQUIRED') ? 'Saldo anterior identificado: revise a obrigação de origem antes de alocar nesta versão.' : 'Uma saída bancária mudou. Reverta ou revise as alocações afetadas.'}</p>}
      <form key={`basis:${value.statementVersion}:${refresh}`} onSubmit={confirmBasis}>
        <label>Base da obrigação para pagamento<select value={kind} onChange={event => setKind(event.target.value)} required disabled={disabled}><option value="">Escolha uma base conhecida</option>{(['declared','calculated'] as const).map(key => value.candidates[key] && <option key={key} value={key}>{key === 'declared' ? 'Total declarado' : 'Total calculado completo'} · BRL {amountInput(value.candidates[key]!.total.cents)}</option>)}</select></label>
        <label className="check"><input type="checkbox" required disabled={disabled} />Confirmo que esta base é o total da obrigação antes dos pagamentos, mesmo quando houver divergência.</label>
        <label className="check"><input type="checkbox" required disabled={disabled} />Confirmo que a base não repete obrigação já representada em outra fatura.</label><button disabled={disabled || !value.candidates[kind as PaymentBasisKind]}>Confirmar base para pagamentos</button>
      </form>
      <p className="note">Pagamentos informados na fatura ficam separados. O saldo acima desconta somente alocações bancárias ativas; datas do caixa e competência permanecem independentes.</p>
      <h4>Selecionar saída bancária</h4><label>Conta bancária do pagamento<select value={accountId} disabled={disabled} onChange={event => { setAccountId(event.target.value); setBankPage(1); setEntries({ rows: [], total: 0 }); setEntryId(''); setEntry(null); }}><option value="">Selecione uma conta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      {accountId && <><label>Movimento bancário para alocar<select value={entryId} disabled={disabled} onChange={event => { setEntryId(event.target.value); setEntry(null); }}><option value="">Selecione um movimento confirmado</option>{entries.rows.map(row => <option key={row.id} value={row.id}>{row.postedOn} · {row.description} · BRL {amountInput(row.amount.cents)}</option>)}</select></label><nav aria-label="Páginas de movimentos para pagamento"><button className="secondary" disabled={disabled || bankPage === 1} onClick={() => { setBankPage(bankPage - 1); setEntryId(''); setEntry(null); }}>Movimentos anteriores para pagamento</button><span>Página {bankPage}</span><button className="secondary" disabled={disabled || bankPage * 25 >= entries.total} onClick={() => { setBankPage(bankPage + 1); setEntryId(''); setEntry(null); }}>Próximos movimentos para pagamento</button></nav></>}
      {entry && <><p data-testid="payment-source-summary">Data de caixa: {entry.postedOn} · Valor original: BRL {amountInput(entry.amount.cents)} · Reservado: BRL {amountInput(entry.allocated.cents)} · Disponível do movimento: {remaining(entry.available)}</p>
        <form key={`${entry.id}:${entry.version}:${value.statementVersion}:${refresh}`} onSubmit={allocate}>
          <label>Magnitude total da saída em reais<input name="outflow" inputMode="decimal" required disabled={disabled} defaultValue={amountInput(entry.confirmedOutflow?.amount.cents)} /></label>
          <label>Valor a alocar nesta fatura em reais<input name="amount" inputMode="decimal" required disabled={disabled} /></label>
          <label className="check"><input type="checkbox" required disabled={disabled} />Confirmo que este movimento é uma saída bancária e que os valores informados correspondem ao pagamento desta fatura.</label><button disabled={disabled || !value.basis?.current || value.progress.state === 'review_required' || value.progress.state === 'no_obligation' || value.progress.state === 'paid'}>Alocar pagamento bancário</button>
        </form></>}
      <h4>Alocações registradas</h4><ul data-testid="payment-allocations">{value.allocations.rows.map(row => <li key={row.id}>{row.postedOn} · {row.description} · BRL {amountInput(row.amount.cents)} · {row.reversedAt ? 'Revertida' : 'Ativa'}{!row.reversedAt && <><br /><button className="secondary" disabled={disabled} onClick={() => void reverse(row.id, row.bankEntryId)}>Reverter alocação de BRL {amountInput(row.amount.cents)}</button></>}</li>)}</ul>
      <nav aria-label="Páginas de alocações"><button className="secondary" disabled={disabled || page === 1} onClick={() => setPage(page - 1)}>Alocações anteriores</button><span>Página {page}</span><button className="secondary" disabled={disabled || page * 25 >= value.allocations.total} onClick={() => setPage(page + 1)}>Próximas alocações</button></nav><button className="secondary" disabled={disabled} onClick={() => void showHistory()}>Consultar histórico de pagamentos</button>
      {history && <div className="statement-history"><h4>Últimos 20 comandos de pagamento</h4>{history.map(row => <p key={row.id}>{row.createdAt} · {row.changes.request.decision.operation === 'basis' ? 'Base confirmada' : row.changes.request.decision.operation === 'allocate' ? 'Alocação' : 'Reversão'} · {stateName[row.changes.current.statement.progress.state]} · Saldo: {remaining(row.changes.current.statement.progress.remaining)}</p>)}</div>}
    </>}
  </div>;
}
