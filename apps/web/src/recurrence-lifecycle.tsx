import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { IncomeDTO, IncomeRecurrenceDTO } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';
import { MoneyField } from './money-field';
type Api = (path: string, body?: unknown, key?: string) => Promise<any>;
const stateLabel = { active: 'Ativa', paused: 'Pausada', cancelled: 'Cancelada definitivamente' };
const actionLabel = { edit: 'Alterar programação futura', pause: 'Pausar gerações', resume: 'Retomar gerações', cancel: 'Cancelar série definitivamente' };
const reasonLabel: Record<string, string> = { update: 'Atualizar', past: 'Passada ou anterior ao alcance: preservar', individual: 'Correção individual: preservar', received: 'Com recebimento: preservar', cancelled: 'Cancelada: preservar', later_schedule: 'Programação posterior: preservar', outside_rule: 'Fora da nova vigência: preservar' };
function facts(value: IncomeDTO) { return `Data: ${value.facts.expectedOn.state === 'confirmed' ? value.facts.expectedOn.value : 'Não informada'} · Valor: ${value.facts.expectedAmount.state === 'confirmed' ? `BRL ${amountInput(value.facts.expectedAmount.value.cents)}` : 'Não informado'}`; }
interface Preview { rule: IncomeRecurrenceDTO; previewHash: string; income?: IncomeDTO; next?: IncomeDTO; received?: { cents: string }; receipts?: { id: string; bankEntryId: string; amount: { cents: string } }[]; counts?: { update: number; preserve: number }; rows?: { period: string; disposition: string; income: IncomeDTO; patch: { description: string; facts: { expectedOn: string; expectedAmount: { cents: string } } } | null }[]; nextState?: IncomeRecurrenceDTO['state'] }
interface Command { path: string; body: unknown; key: string }
export function RecurrenceLifecycle({ rule, api, parentBusy, setParentBusy, onChanged }: { rule: IncomeRecurrenceDTO; api: Api; parentBusy: boolean; setParentBusy: (value: boolean) => void; onChanged: (value: IncomeRecurrenceDTO) => void }) {
  const [action, setAction] = useState<keyof typeof actionLabel>('edit'); const [individualAction, setIndividualAction] = useState<'edit' | 'cancel'>('edit');
  const [preview, setPreview] = useState<Preview | null>(null); const [request, setRequest] = useState<{ path: string; body: Record<string, unknown> } | null>(null);
  const [selected, setSelected] = useState<IncomeDTO | null>(null); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [list, setList] = useState<{ total: number; rows: { period: string; originalExpectedOn: string; originalAmount: { cents: string }; exception: boolean; income: IncomeDTO }[] }>({ total: 0, rows: [] });
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [message, setMessage] = useState(''); const pending = useRef<Command | null>(null); const locked = busy || uncertain || parentBusy;
  const showError = (error: unknown) => setMessage(error instanceof Error ? error.message : 'Falha de conexão. Tente novamente.');
  useEffect(() => { let active = true; void api(`/income-recurrences/${rule.id}/occurrences?page=${page}`).then(value => { if (active) setList(value); }).catch(error => { if (active) showError(error); }); return () => { active = false; }; }, [rule.id, rule.version, page, refresh]);
  function clearPreview() { setPreview(null); setRequest(null); }
  useEffect(() => { setAction('edit'); clearPreview(); }, [rule.version]);
  async function simulate(path: string, body: Record<string, unknown>) {
    setBusy(true); setParentBusy(true); setMessage(''); clearPreview();
    try { setPreview(await api(`${path}-preview`, body)); setRequest({ path, body }); } catch (error) { showError(error); } finally { setBusy(false); setParentBusy(false); }
  }
  async function execute(command: Command) {
    pending.current = command; setBusy(true); setParentBusy(true); setUncertain(false); setMessage('');
    try {
      const result = await api(command.path, command.body, command.key); const current = await api(`/income-recurrences/${rule.id}`);
      const selectedId = result.income?.id ?? selected?.id;
      if (selectedId) setSelected(await api(`/incomes/${selectedId}`));
      pending.current = null; clearPreview(); onChanged(current); setRefresh(value => value + 1); setMessage('Alteração confirmada. Histórico e movimentos preservados.'); setParentBusy(false);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && [400, 401, 403, 404, 409, 413].includes(error.status as number)) { pending.current = null; clearPreview(); setParentBusy(false); } else setUncertain(true);
      showError(error);
    } finally { setBusy(false); }
  }
  function series(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked) return; const data = new FormData(event.currentTarget);
    try { void simulate(`/income-recurrences/${rule.id}/change`, action === 'edit' ? { action, fromPeriod: data.get('fromPeriod'), input: { description: data.get('description'), notes: String(data.get('notes') ?? '').trim() || null, amount: { currency: 'BRL', cents: centsInput(String(data.get('amount'))) }, anchorDay: Number(data.get('anchorDay')), endsOn: data.get('endsOn') || null } } : { action }); } catch (error) { showError(error); }
  }
  function individual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked || !selected) return; const data = new FormData(event.currentTarget);
    try { const amount = String(data.get('expectedAmount') ?? '').trim(); void simulate(`/income-recurrences/${rule.id}/occurrences/${selected.id}/change`, individualAction === 'cancel' ? { action: 'cancel' } : { action: 'edit', patch: { description: data.get('description'), notes: String(data.get('notes') ?? '').trim() || null, facts: { expectedOn: data.get('expectedOn') || null, expectedAmount: amount ? { currency: 'BRL', cents: centsInput(amount) } : null } } }); } catch (error) { showError(error); }
  }
  return <details><summary>Gerenciar série e ocorrências</summary>
    <p>Estado da série: {stateLabel[rule.state]}. Pausa e cancelamento da série preservam receitas já geradas. Retomar não cria previsões nem preenche lacunas.</p>
    {message && <p role="status">{message}</p>}
    {uncertain && <><p>Resposta não confirmada. Dados e chave preservados; recupere antes de continuar.</p><button disabled={busy} onClick={() => pending.current && void execute(pending.current)}>Recuperar alteração da recorrência</button></>}
    <h3>Programações por competência</h3><ul>{rule.schedules.map(item => <li key={item.version}>Desde {item.effectiveFrom === '0001-01' ? 'o início' : item.effectiveFrom} · Dia {item.anchorDay} · BRL {amountInput(item.amount.cents)} · {item.description} · Fim: {item.endsOn ?? 'não informado'} · Versão {item.version}</li>)}</ul>
    {rule.state !== 'cancelled' && <form key={`series:${rule.id}:${rule.version}`} onSubmit={series} onChange={clearPreview}>
      <h3>Alteração da série</h3><label>Ação na série<select value={action} disabled={locked} onChange={event => { setAction(event.target.value as typeof action); clearPreview(); }}><option value="edit">{actionLabel.edit}</option>{rule.state === 'active' ? <option value="pause">{actionLabel.pause}</option> : <option value="resume">{actionLabel.resume}</option>}<option value="cancel">{actionLabel.cancel}</option></select></label>
      {action === 'edit' && <><label>Alterar a partir do mês<input name="fromPeriod" type="month" min="0001-01" max="9999-12" required disabled={locked} /></label><label>Descrição futura da receita<input name="description" required maxLength={500} defaultValue={rule.description} disabled={locked} /></label><MoneyField label="Novo valor mensal em reais" name="amount" required defaultValue={amountInput(rule.amount.cents)} disabled={locked} /><label>Novo dia âncora<input name="anchorDay" type="number" min="1" max="31" step="1" defaultValue={rule.anchorDay} required disabled={locked} /></label><label>Novo fim da vigência (opcional)<input name="endsOn" type="date" min="0001-01-01" max="9999-12-31" defaultValue={rule.endsOn ?? ''} disabled={locked} /></label><label>Notas da programação futura<input name="notes" maxLength={1000} defaultValue={rule.notes ?? ''} disabled={locked} /></label></>}
      <button disabled={locked}>Conferir impacto na série</button>
    </form>}
    <h3>Ocorrências geradas</h3><div className="import-list">{list.rows.map(row => <button className="secondary" disabled={locked} key={row.income.id} onClick={() => { setSelected(row.income); setIndividualAction('edit'); clearPreview(); }}>Corrigir ocorrência: {row.period} · {row.income.description} · {row.income.state === 'cancelled' ? 'Cancelada' : row.exception ? 'Correção individual' : 'Prevista'}</button>)}</div>
    {list.total > 25 && <nav aria-label="Páginas de ocorrências"><button disabled={locked || page === 1} onClick={() => setPage(page - 1)}>Ocorrências anteriores</button><span>Página {page}</span><button disabled={locked || page * 25 >= list.total} onClick={() => setPage(page + 1)}>Próximas ocorrências</button></nav>}
    {selected && <div><p>Somente esta ocorrência: {selected.description} · {facts(selected)}. A programação da série será preservada.</p>
      {selected.state === 'cancelled' ? <p>Ocorrência cancelada definitivamente; não será recriada pela geração.</p> : <form key={`individual:${selected.id}:${selected.version}`} onSubmit={individual} onChange={clearPreview}>
        <label>Ação na ocorrência<select value={individualAction} disabled={locked} onChange={event => { setIndividualAction(event.target.value as typeof individualAction); clearPreview(); }}><option value="edit">Corrigir somente esta receita</option><option value="cancel">Cancelar somente esta receita</option></select></label>
        {individualAction === 'edit' && <><label>Descrição da ocorrência<input name="description" required maxLength={500} defaultValue={selected.description} disabled={locked} /></label><label>Data prevista da ocorrência<input name="expectedOn" type="date" min="0001-01-01" max="9999-12-31" defaultValue={selected.facts.expectedOn.state === 'confirmed' ? selected.facts.expectedOn.value : ''} disabled={locked} /></label><MoneyField label="Valor previsto da ocorrência em reais" name="expectedAmount" defaultValue={selected.facts.expectedAmount.state === 'confirmed' ? amountInput(selected.facts.expectedAmount.value.cents) : ''} disabled={locked} /><label>Notas da ocorrência<input name="notes" maxLength={1000} defaultValue={selected.notes ?? ''} disabled={locked} /></label></>}
        <button disabled={locked}>Conferir impacto na ocorrência</button>
      </form>}
    </div>}
    {preview && request && <div className="confirmation-summary"><h3>Revise o impacto da alteração</h3>
      {preview.income && preview.next ? <><p>Antes: {preview.income.description} · {facts(preview.income)}</p><p>Depois: {preview.next.description} · {facts(preview.next)} · {preview.next.state === 'cancelled' ? 'Cancelada definitivamente' : 'Prevista'}</p><p>Recebido e preservado: BRL {amountInput(preview.received?.cents ?? '0')}. {preview.receipts?.length ?? 0} vínculo(s) ativo(s).</p></> : <><p>{preview.counts?.update ?? 0} receita(s) a atualizar · {preview.counts?.preserve ?? 0} preservada(s) · Estado resultante: {preview.nextState ? stateLabel[preview.nextState] : ''}.</p>
        {preview.rows && preview.rows.length > 0 && <div className="import-table" role="region" aria-label="Impacto nas ocorrências" tabIndex={0}><table><caption>Antes e depois por ocorrência</caption><thead><tr><th>Mês</th><th>Atual</th><th>Resultado</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.income.id}><td>{row.period}</td><td>{row.income.description} · {facts(row.income)}</td><td>{reasonLabel[row.disposition]}{row.patch && ` · ${row.patch.description} · ${row.patch.facts.expectedOn} · BRL ${amountInput(row.patch.facts.expectedAmount.cents)}`}</td></tr>)}</tbody></table></div>}</>}
      <form key={preview.previewHash} onSubmit={event => { event.preventDefault(); if (!locked && !pending.current) void execute({ path: request.path, key: crypto.randomUUID(), body: { ...request.body, expectedVersion: preview.rule.version, ...(preview.income ? { expectedIncomeVersion: preview.income.version } : {}), previewHash: preview.previewHash, changeConfirmed: true } }); }}>
        <label className="check"><input type="checkbox" required disabled={locked} />Revisei o alcance e confirmo esta alteração, preservando histórico e caixa.</label><button disabled={locked}>Confirmar alteração da recorrência</button>
      </form>
    </div>}
  </details>;
}
