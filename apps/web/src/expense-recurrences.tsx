import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ExpenseDTO, ExpenseOccurrenceDTO, ExpenseRecurrenceDTO, ExpenseRecurrenceOperation } from '@rovere/domain';
import { MoneyField } from './money-field';
import { amountInput, centsInput } from './money-input';

type Api = (path: string, body?: unknown, key?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;
interface Preview { rule: ExpenseRecurrenceDTO; operation: ExpenseRecurrenceOperation; occurrence: ExpenseOccurrenceDTO | null; expense: ExpenseDTO | null; difference: { cents: string } | null; previewHash: string; counts: { create: number; update: number; preserve: number }; rows: { period: string; expectedOn: string; amount: { cents: string }; disposition: string }[] }
interface Command { path: string; body: unknown; key: string; ruleId?: string }
interface History { id: string; version: number; createdAt: string; changes: { action: string; previous?: { rule?: ExpenseRecurrenceDTO; occurrence?: ExpenseOccurrenceDTO | null } | null; current?: { rule?: ExpenseRecurrenceDTO; occurrence?: ExpenseOccurrenceDTO | null } } }
const labels: Record<string, string> = { create: 'Regra criada', generate: 'Gerar previsões', edit_series: 'Alterar programação futura', pause: 'Pausar novas gerações', resume: 'Retomar novas gerações', cancel_series: 'Cancelar série definitivamente', record: 'Criar despesa efetiva', link: 'Vincular despesa existente', review: 'Revisar fatos corrigidos', edit_occurrence: 'Corrigir previsão individual', cancel_occurrence: 'Cancelar previsão individual', existing: 'Já existe', outside_rule: 'Fora da vigência', blocked: 'Geração bloqueada', update: 'Atualizar previsão', past: 'Preservar passada', individual: 'Preservar correção individual', cancelled: 'Cancelada', recorded: 'Registrada', later_schedule: 'Preservar programação posterior', planned: 'Prevista', active: 'Ativa', paused: 'Pausada' };
const brl = (cents: string) => `BRL ${amountInput(cents)}`;
const money = (value: FormDataEntryValue | null) => ({ currency: 'BRL' as const, cents: centsInput(String(value ?? '')) });
function ruleFields(data: FormData) { return { description: String(data.get('description')), notes: String(data.get('notes') ?? '').trim() || null, amount: money(data.get('amount')), anchorDay: Number(data.get('anchorDay')), endsOn: String(data.get('endsOn') ?? '') || null }; }

export function ExpenseRecurrences({ api, financialVersion }: { api: Api; financialVersion: number }) {
  const [list, setList] = useState<{ rows: ExpenseRecurrenceDTO[]; total: number }>({ rows: [], total: 0 }); const [page, setPage] = useState(1);
  const [rule, setRule] = useState<ExpenseRecurrenceDTO | null>(null); const [preview, setPreview] = useState<Preview | null>(null);
  const [occurrences, setOccurrences] = useState<{ rows: ExpenseOccurrenceDTO[]; total: number }>({ rows: [], total: 0 }); const [occurrencePage, setOccurrencePage] = useState(1); const [selectedId, setSelectedId] = useState('');
  const [expenses, setExpenses] = useState<{ rows: Pick<ExpenseDTO, 'id' | 'description' | 'knowledge' | 'version'>[]; total: number }>({ rows: [], total: 0 }); const [expensePage, setExpensePage] = useState(1);
  const [history, setHistory] = useState<History[] | null>(null); const [seriesAction, setSeriesAction] = useState('generate'); const [occurrenceAction, setOccurrenceAction] = useState('record');
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [message, setMessage] = useState(''); const [refresh, setRefresh] = useState(0);
  const pending = useRef<Command | null>(null); const locked = busy || uncertain; const occurrence = occurrences.rows.find(row => row.id === selectedId) ?? null;
  const error = (value: unknown) => setMessage(value instanceof Error ? value.message : 'Falha de conexão. Tente novamente.');
  useEffect(() => { let active = true; void api(`/expense-recurrences?page=${page}`).then(value => { if (active) setList(value); }).catch(value => { if (active) error(value); }); return () => { active = false; }; }, [page, refresh]);
  useEffect(() => { let active = true; if (rule) void api(`/expense-recurrences/${rule.id}/occurrences?page=${occurrencePage}`).then(value => { if (active) setOccurrences(value); }).catch(value => { if (active) error(value); }); return () => { active = false; }; }, [rule?.id, occurrencePage, financialVersion, refresh]);
  useEffect(() => { let active = true; void api(`/expenses?page=${expensePage}`).then(value => { if (active) setExpenses(value); }).catch(value => { if (active) error(value); }); return () => { active = false; }; }, [expensePage, financialVersion, refresh]);
  async function open(id: string) { setBusy(true); setMessage(''); try { const current = await api(`/expense-recurrences/${id}`); setRule(current); setOccurrences({ rows: [], total: 0 }); setOccurrencePage(1); setSelectedId(''); setPreview(null); setHistory(null); setSeriesAction(current.state === 'paused' ? 'resume' : 'generate'); } catch (value) { error(value); } finally { setBusy(false); } }
  async function execute(command: Command) {
    pending.current = command; setBusy(true); setUncertain(false); setMessage('');
    try {
      const result = await api(command.path, command.body, command.key); const current = await api(`/expense-recurrences/${command.ruleId ?? result.id}`);
      setRule(current); setSeriesAction(current.state === 'paused' ? 'resume' : 'generate'); setPreview(null); setHistory(null); pending.current = null; setRefresh(value => value + 1);
      setMessage(command.ruleId ? 'Decisão confirmada. Previsões, despesas e caixa permanecem separados.' : 'Regra cadastrada. Revise o intervalo para gerar previsões.');
    } catch (value) {
      if (value && typeof value === 'object' && 'status' in value && [400, 401, 403, 404, 409, 413].includes(value.status as number)) { pending.current = null; if (value.status === 409) setPreview(null); }
      else setUncertain(true); error(value);
    } finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked || pending.current) return; const data = new FormData(event.currentTarget);
    try { await execute({ path: '/expense-recurrences', body: { ...ruleFields(data), startsOn: data.get('startsOn') }, key: crypto.randomUUID() }); } catch (value) { error(value); }
  }
  async function simulate(operation: ExpenseRecurrenceOperation) {
    if (!rule || locked) return; setBusy(true); setMessage(''); setPreview(null);
    try { const value = await api(`/expense-recurrences/${rule.id}/preview`, operation); setRule(value.rule); setPreview(value); } catch (value) { error(value); } finally { setBusy(false); }
  }
  function series(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      const operation = seriesAction === 'generate' ? { action: 'generate', fromPeriod: data.get('fromPeriod'), toPeriod: data.get('toPeriod') } : seriesAction === 'edit_series' ? { action: 'edit_series', fromPeriod: data.get('fromPeriod'), input: ruleFields(data) } : { action: seriesAction };
      void simulate(operation as ExpenseRecurrenceOperation);
    } catch (value) { error(value); }
  }
  async function individual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!occurrence || locked) return; const data = new FormData(event.currentTarget);
    try {
      const action = occurrence.state === 'recorded' ? 'review' : occurrenceAction; let operation: unknown;
      if (action === 'record') operation = { action, occurrenceId: occurrence.id, expense: { description: data.get('description'), notes: String(data.get('notes') ?? '').trim() || null, facts: { purchasedOn: data.get('purchasedOn'), total: money(data.get('actualAmount')) } } };
      else if (action === 'link') { const expense = expenses.rows.find(row => row.id === data.get('expenseId')); if (!expense) throw new Error('Selecione uma despesa existente.'); operation = { action, occurrenceId: occurrence.id, expenseId: expense.id, expectedExpenseVersion: expense.version }; }
      else if (action === 'review') operation = { action, occurrenceId: occurrence.id, expectedExpenseVersion: occurrence.expense!.version };
      else if (action === 'edit_occurrence') operation = { action, occurrenceId: occurrence.id, input: { description: data.get('description'), notes: String(data.get('notes') ?? '').trim() || null, expectedOn: data.get('expectedOn'), amount: money(data.get('amount')) } };
      else operation = { action, occurrenceId: occurrence.id };
      await simulate(operation as ExpenseRecurrenceOperation);
    } catch (value) { error(value); }
  }
  return <section className="planned-incomes" aria-labelledby="expense-recurrences-title" aria-busy={busy}>
    <h2 id="expense-recurrences-title">Despesas e assinaturas recorrentes</h2>
    <p>Previsões mensais com competência de planejamento confirmada. A data da despesa e a competência da fatura são independentes. Nenhuma previsão movimenta caixa.</p>
    {message && <p role="status">{message}</p>}
    {uncertain && <div><p>Resposta não confirmada. Dados e chave preservados; recupere o resultado antes de continuar.</p><button disabled={busy} onClick={() => pending.current && void execute(pending.current)}>Recuperar decisão da despesa recorrente</button></div>}
    <div className="import-list">{list.rows.map(row => <button className="secondary" disabled={locked} key={row.id} onClick={() => void open(row.id)}>Abrir assinatura: {row.description} · Dia {row.anchorDay}</button>)}</div>
    {list.total > 25 && <nav aria-label="Páginas de assinaturas"><button disabled={locked || page === 1} onClick={() => setPage(page - 1)}>Assinaturas anteriores</button><span>Página {page}</span><button disabled={locked || page * 25 >= list.total} onClick={() => setPage(page + 1)}>Próximas assinaturas</button></nav>}
    <button disabled={locked} className="secondary" onClick={() => { setRule(null); setPreview(null); setHistory(null); setSelectedId(''); }}>Nova assinatura mensal</button>
    {!rule ? <form onSubmit={create}>
      <ScheduleFields disabled={locked} /><label>Início da assinatura<input name="startsOn" type="date" required disabled={locked} /></label>
      <label><input type="checkbox" required disabled={locked} />Confirmo esta regra mensal de despesa, sem criar despesas agora</label><button disabled={locked}>Cadastrar assinatura</button>
    </form> : <>
      <h3>{rule.description}</h3><p>Regra {labels[rule.state]} · {brl(rule.amount.cents)} · Dia âncora {rule.anchorDay} · {rule.occurrenceCount} ocorrência(s).</p>
      {rule.state !== 'cancelled' ? <form key={`series:${rule.id}`} onSubmit={series} onChange={() => setPreview(null)}>
        <label>Ação da série de despesas<select value={seriesAction} disabled={locked} onChange={event => setSeriesAction(event.target.value)}>{(rule.state === 'active' ? ['generate', 'edit_series', 'pause', 'cancel_series'] : ['edit_series', 'resume', 'cancel_series']).map(action => <option key={action} value={action}>{labels[action]}</option>)}</select></label>
        {['generate', 'edit_series'].includes(seriesAction) && <label>Competência inicial de planejamento<input name="fromPeriod" type="month" required disabled={locked} /></label>}
        {seriesAction === 'generate' && <><label>Competência final de planejamento<input name="toPeriod" type="month" required disabled={locked} /></label><p>Intervalo inclusivo de até 120 meses. Dias inexistentes usam o último dia do mês, preservando a âncora.</p></>}
        {seriesAction === 'edit_series' && <ScheduleFields key={`schedule:${rule.id}:${rule.version}`} value={rule} disabled={locked} />}
        {seriesAction !== 'generate' && <p>Passadas, corrigidas individualmente e registradas são preservadas. Pausar/retomar não preenche lacunas; cancelar a série é definitivo e preserva todas as ocorrências.</p>}
        <button disabled={locked}>Revisar ação da série de despesas</button>
      </form> : <p>Série cancelada definitivamente. Ocorrências e despesas existentes preservadas; geração não será retomada.</p>}
      <h3>Ocorrências de despesas</h3>
      <div className="import-list">{occurrences.rows.map(row => <button key={row.id} className="secondary" disabled={locked} onClick={() => { setSelectedId(row.id); setOccurrenceAction('record'); setPreview(null); }}>Competência {row.period} · {row.description} · {labels[row.state]} · {brl(row.amount.cents)}</button>)}</div>
      {occurrences.total === 0 && <p>Nenhuma ocorrência gerada.</p>}
      {occurrences.total > 25 && <nav aria-label="Páginas de ocorrências de despesas"><button disabled={locked || occurrencePage === 1} onClick={() => { setOccurrencePage(occurrencePage - 1); setSelectedId(''); setPreview(null); }}>Ocorrências anteriores</button><span>Página {occurrencePage}</span><button disabled={locked || occurrencePage * 25 >= occurrences.total} onClick={() => { setOccurrencePage(occurrencePage + 1); setSelectedId(''); setPreview(null); }}>Próximas ocorrências</button></nav>}
      {occurrence && <div>
        <h4>Competência de planejamento {occurrence.period}</h4><p>Previsão: {brl(occurrence.amount.cents)} em {occurrence.expectedOn}. {labels[occurrence.state]}.</p>
        <p>Geração original: {brl(occurrence.original.amount.cents)} em {occurrence.original.expectedOn}.{occurrence.individual && ' Correção individual preservada.'}</p>
        {occurrence.expense && <><ExpenseFacts value={occurrence.expense} /><p>Diferença efetivo − previsto: {occurrence.difference ? brl(occurrence.difference.cents) : 'Valor efetivo desconhecido'}. {occurrence.reviewRequired && 'Fatos corrigidos: revisão necessária.'}</p><p>Liquidação bancária desta despesa não está disponível. Cobranças e pagamentos de fatura são evidências separadas; não presumir pagamento da assinatura.</p></>}
        {occurrence.confirmation && occurrence.reviewRequired && <details><summary>Fatos na última confirmação</summary><ExpenseFacts value={occurrence.confirmation} /></details>}
        {occurrence.state !== 'cancelled' && <form key={`occurrence:${occurrence.id}:${occurrence.version}:${occurrenceAction}`} onSubmit={individual} onChange={() => setPreview(null)}>
          {occurrence.state === 'planned' && <label>Ação da ocorrência de despesa<select value={occurrenceAction} disabled={locked} onChange={event => setOccurrenceAction(event.target.value)}>{['record', 'link', 'edit_occurrence', 'cancel_occurrence'].map(action => <option key={action} value={action}>{labels[action]}</option>)}</select></label>}
          {occurrence.state === 'planned' && ['record', 'edit_occurrence'].includes(occurrenceAction) && <><label>Descrição do fato<input name="description" defaultValue={occurrence.description} required maxLength={500} disabled={locked} /></label><label>Notas do fato<textarea name="notes" defaultValue={occurrence.notes ?? ''} maxLength={1000} disabled={locked} /></label>
            {occurrenceAction === 'record' ? <><label>Data efetiva da despesa<input name="purchasedOn" type="date" required disabled={locked} /></label><MoneyField label="Valor efetivo da despesa em reais" name="actualAmount" required disabled={locked} /><p>Informe data e valor reais. Eles não são preenchidos a partir da previsão.</p></> : <><label>Data prevista corrigida<input name="expectedOn" type="date" defaultValue={occurrence.expectedOn} required disabled={locked} /></label><MoneyField label="Valor previsto corrigido em reais" name="amount" defaultValue={amountInput(occurrence.amount.cents)} required disabled={locked} /></>}
          </>}
          {occurrence.state === 'planned' && occurrenceAction === 'link' && <><label>Despesa existente<select name="expenseId" required disabled={locked}><option value="">Selecione uma despesa</option>{expenses.rows.map(row => <option key={row.id} value={row.id}>{row.description}{row.knowledge === 'partial' ? ' · Complete data e valor em Compras' : ''}</option>)}</select></label><p>Os fatos existentes serão exibidos na prévia e preservados. Uma despesa só pode confirmar uma ocorrência.</p>
            {expenses.total > 25 && <nav aria-label="Páginas de despesas para vínculo"><button type="button" disabled={locked || expensePage === 1} onClick={() => { setExpensePage(expensePage - 1); setPreview(null); }}>Despesas anteriores</button><span>Página {expensePage}</span><button type="button" disabled={locked || expensePage * 25 >= expenses.total} onClick={() => { setExpensePage(expensePage + 1); setPreview(null); }}>Próximas despesas</button></nav>}</>}
          {occurrence.state === 'recorded' && <p>Revisar confirma os fatos atuais e preserva a confirmação anterior no histórico. A despesa permanece vinculada; não cria outra.</p>}
          {occurrenceAction === 'cancel_occurrence' && occurrence.state === 'planned' && <p>Cancelamento individual definitivo. Não exclui a evidência de geração nem permite gerar novamente a mesma competência.</p>}
          <button disabled={locked}>{occurrence.state === 'recorded' ? 'Revisar fatos da despesa registrada' : 'Revisar ação da ocorrência de despesa'}</button>
        </form>}
      </div>}
      {preview && <form key={preview.previewHash} onSubmit={event => { event.preventDefault(); if (!locked) void execute({ path: `/expense-recurrences/${rule.id}/confirm`, ruleId: rule.id, key: crypto.randomUUID(), body: { operation: preview.operation, expectedVersion: preview.rule.version, ...(preview.occurrence ? { expectedOccurrenceVersion: preview.occurrence.version } : {}), previewHash: preview.previewHash, confirmed: true } }); }}>
        <h3>Prévia: {labels[preview.operation.action]}</h3><p>Criar {preview.counts.create} previsão(ões), atualizar {preview.counts.update}, preservar {preview.counts.preserve}.</p>
        {preview.occurrence && <p>Antes da decisão: competência {preview.occurrence.period} · {preview.occurrence.description} · {preview.occurrence.expectedOn} · {brl(preview.occurrence.amount.cents)} · {labels[preview.occurrence.state]}.</p>}
        {preview.rows.length > 0 && <div className="import-table"><table><thead><tr><th>Competência de planejamento</th><th>Data prevista</th><th>Valor previsto</th><th>Decisão</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.period}><td>{row.period}</td><td>{row.expectedOn}</td><td>{brl(row.amount.cents)}</td><td>{labels[row.disposition]}</td></tr>)}</tbody></table></div>}
        {preview.operation.action === 'record' && <p>Nova despesa: {preview.operation.expense.description} · Data efetiva {preview.operation.expense.facts?.purchasedOn} · {brl(preview.operation.expense.facts!.total!.cents)}.</p>}
        {preview.expense && <ExpenseFacts value={preview.expense} />}
        {preview.difference && <p>Diferença efetivo − previsto: {brl(preview.difference.cents)}.</p>}
        {preview.operation.action === 'edit_series' && <p>Programação desde {preview.operation.fromPeriod}: {preview.operation.input.description} · {brl(preview.operation.input.amount.cents)} · Dia {preview.operation.input.anchorDay} · Fim {preview.operation.input.endsOn ?? 'sem fim informado'}.</p>}
        {preview.operation.action === 'edit_occurrence' && <p>Previsão corrigida: {preview.operation.input.description} · {preview.operation.input.expectedOn} · {brl(preview.operation.input.amount.cents)}.</p>}
        <label><input type="checkbox" required disabled={locked} />Confirmo a competência de planejamento e a decisão exibida, sem criar caixa ou pagamento</label><button disabled={locked}>Confirmar decisão da despesa recorrente</button>
      </form>}
      <button className="secondary" disabled={locked} onClick={() => { setBusy(true); void api(`/expense-recurrences/${rule.id}/history`).then(setHistory).catch(error).finally(() => setBusy(false)); }}>Histórico da assinatura</button>
      {history && <><p>As decisões abaixo mostram os fatos daquele momento; consulte a ocorrência para o estado atual.</p><ol>{history.map(row => <li key={row.id}><details><summary>{labels[row.changes.action] ?? row.changes.action} · revisão {row.version} · {new Date(row.createdAt).toLocaleString('pt-BR')}</summary>
        {row.changes.previous?.rule && <p>Série antes: {row.changes.previous.rule.description} · {brl(row.changes.previous.rule.amount.cents)} · {labels[row.changes.previous.rule.state]}.</p>}
        {row.changes.current?.rule && <p>Série depois: {row.changes.current.rule.description} · {brl(row.changes.current.rule.amount.cents)} · {labels[row.changes.current.rule.state]}.</p>}
        {row.changes.previous?.occurrence && <p>Previsão antes: {row.changes.previous.occurrence.expectedOn} · {brl(row.changes.previous.occurrence.amount.cents)} · {labels[row.changes.previous.occurrence.state]}.</p>}
        {row.changes.previous?.occurrence?.confirmation && <div><p>Confirmação anterior:</p><ExpenseFacts value={row.changes.previous.occurrence.confirmation} /></div>}
        {row.changes.current?.occurrence && <p>Previsão depois: {row.changes.current.occurrence.expectedOn} · {brl(row.changes.current.occurrence.amount.cents)} · {labels[row.changes.current.occurrence.state]}.</p>}
        {row.changes.current?.occurrence?.confirmation && <div><p>Confirmação registrada nesta decisão:</p><ExpenseFacts value={row.changes.current.occurrence.confirmation} /></div>}
      </details></li>)}</ol></>}
    </>}
  </section>;
}
function ScheduleFields({ disabled, value }: { disabled: boolean; value?: ExpenseRecurrenceDTO }) {
  return <><label>Descrição da assinatura<input name="description" defaultValue={value?.description} required maxLength={500} disabled={disabled} /></label><label>Notas da assinatura<textarea name="notes" defaultValue={value?.notes ?? ''} maxLength={1000} disabled={disabled} /></label><MoneyField label="Valor mensal previsto em reais" name="amount" defaultValue={value ? amountInput(value.amount.cents) : ''} required disabled={disabled} /><label>Dia âncora da assinatura<input name="anchorDay" type="number" min={1} max={31} step={1} required defaultValue={value?.anchorDay} disabled={disabled} /></label><label>Fim da assinatura (opcional)<input name="endsOn" type="date" defaultValue={value?.endsOn ?? ''} disabled={disabled} /></label></>;
}
function ExpenseFacts({ value }: { value: ExpenseDTO }) {
  return <p>Despesa registrada: {value.description} · Data efetiva {value.facts.purchasedOn.state === 'confirmed' ? value.facts.purchasedOn.value : 'Não informada'} · Valor efetivo {value.facts.total.state === 'confirmed' ? brl(value.facts.total.value.cents) : 'Não informado'} · {value.charges.length} cobrança(s) associada(s).</p>;
}
