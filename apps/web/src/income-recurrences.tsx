import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { IncomeRecurrenceDTO, GenerationRange } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';
import { RecurrenceLifecycle } from './recurrence-lifecycle';
import { MoneyField } from './money-field';

type Api = (path: string, body?: unknown, key?: string) => Promise<any>;
interface Preview { rule: IncomeRecurrenceDTO; range: GenerationRange; previewHash: string; counts: { create: number; existing: number; outsideRule: number; blocked: number }; rows: { period: string; expectedOn: string; amount: { cents: string }; state: 'create' | 'existing' | 'outside_rule' | 'blocked'; income: import('@rovere/domain').IncomeDTO | null }[] }
interface Command { path: string; body: unknown; key: string; ruleId?: string }
interface History { id: string; version: number; createdAt: string; changes: { action: string; result?: { created: unknown[] }; request?: { range: GenerationRange } } }
const stateLabel = { create: 'Criar previsão', existing: 'Já existente', outside_rule: 'Fora da vigência', blocked: 'Regra pausada ou cancelada' };
const actionLabel: Record<string, string> = { create: 'Regra criada', edit: 'Programação futura alterada', pause: 'Gerações pausadas', resume: 'Gerações retomadas', cancel: 'Série cancelada', edit_occurrence: 'Ocorrência corrigida', cancel_occurrence: 'Ocorrência cancelada' };

export function IncomeRecurrences({ api }: { api: Api }) {
  const [list, setList] = useState<{ rows: IncomeRecurrenceDTO[]; total: number }>({ rows: [], total: 0 }); const [page, setPage] = useState(1);
  const [rule, setRule] = useState<IncomeRecurrenceDTO | null>(null); const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<History[] | null>(null); const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState(''); const [refresh, setRefresh] = useState(0); const pending = useRef<Command | null>(null); const [lifecycleBusy, setLifecycleBusy] = useState(false); const locked = busy || uncertain || lifecycleBusy;
  const error = (value: unknown) => setMessage(value instanceof Error ? value.message : 'Falha de conexão. Tente novamente.');
  useEffect(() => { let active = true; void api(`/income-recurrences?page=${page}`).then(value => { if (active) setList(value); }).catch(value => { if (active) error(value); }); return () => { active = false; }; }, [page, refresh]);
  async function open(id: string) { setBusy(true); setMessage(''); try { setRule(await api(`/income-recurrences/${id}`)); setPreview(null); setHistory(null); } catch (value) { error(value); } finally { setBusy(false); } }
  async function execute(command: Command) {
    pending.current = command; setBusy(true); setUncertain(false); setMessage('');
    try {
      const result = await api(command.path, command.body, command.key);
      const current = await api(`/income-recurrences/${command.ruleId ?? result.id}`);
      setRule(current); setPreview(null); setHistory(null); pending.current = null; setRefresh(value => value + 1);
      setMessage(command.ruleId ? `${result.created.length} previsão(ões) criada(s). Caixa preservado.` : 'Regra cadastrada. Solicite uma prévia para gerar previsões.');
    } catch (value) {
      if (value && typeof value === 'object' && 'status' in value && [400, 401, 403, 404, 409, 413].includes(value.status as number)) {
        pending.current = null;
        if (value.status === 409) setPreview(null);
      } else setUncertain(true);
      error(value);
    } finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked || pending.current) return; const data = new FormData(event.currentTarget);
    try { await execute({ path: '/income-recurrences', key: crypto.randomUUID(), body: { description: data.get('description'), notes: String(data.get('notes') ?? '').trim() || null, amount: { currency: 'BRL', cents: centsInput(String(data.get('amount'))) }, anchorDay: Number(data.get('anchorDay')), startsOn: data.get('startsOn'), endsOn: data.get('endsOn') || null } }); } catch (value) { error(value); }
  }
  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!rule || locked) return; const data = new FormData(event.currentTarget); setBusy(true); setPreview(null); setMessage('');
    try { const value: Preview = await api(`/income-recurrences/${rule.id}/preview`, { fromPeriod: data.get('fromPeriod'), toPeriod: data.get('toPeriod') }); setRule(value.rule); setPreview(value); } catch (value) { error(value); } finally { setBusy(false); }
  }
  return <section className="planned-incomes" aria-labelledby="recurrences-title" aria-busy={busy}>
    <h2 id="recurrences-title">Recorrências de receitas</h2>
    <p>Valor fixo mensal, uma âncora por regra. Dias inexistentes usam o último dia do mês e preservam a âncora original. Gere somente o intervalo revisado, até 120 meses. Previsões não movimentam caixa.</p>
    {message && <p role="status">{message}</p>}
    {uncertain && <div><p>A resposta não foi confirmada. Dados e chave preservados; recupere o resultado antes de continuar.</p><button disabled={busy} onClick={() => pending.current && void execute(pending.current)}>Recuperar resultado da recorrência</button></div>}
    <div className="import-list">{list.rows.map(item => <button className="secondary" disabled={locked} key={item.id} onClick={() => void open(item.id)}>Abrir regra: {item.description} · Dia {item.anchorDay}</button>)}</div>
    {list.total > 25 && <nav aria-label="Páginas de recorrências"><button disabled={locked || page === 1} onClick={() => setPage(page - 1)}>Regras anteriores</button><span>Página {page}</span><button disabled={locked || page * 25 >= list.total} onClick={() => setPage(page + 1)}>Próximas regras</button></nav>}
    <button className="secondary" disabled={locked} onClick={() => { setRule(null); setPreview(null); setHistory(null); setMessage(''); }}>Nova regra mensal</button>
    {!rule ? <form onSubmit={create}>
      <label>Descrição da regra mensal<input name="description" required maxLength={500} disabled={locked} /></label>
      <MoneyField label="Valor mensal em reais" name="amount" required disabled={locked} />
      <label>Dia âncora<input name="anchorDay" type="number" min="1" max="31" step="1" required disabled={locked} /></label>
      <label>Início da vigência<input name="startsOn" type="date" min="0001-01-01" max="9999-12-31" required disabled={locked} /></label>
      <label>Fim da vigência (opcional)<input name="endsOn" type="date" min="0001-01-01" max="9999-12-31" disabled={locked} /></label>
      <label>Notas da regra mensal<input name="notes" maxLength={1000} disabled={locked} /></label>
      <label className="check"><input type="checkbox" required disabled={locked} />Confirmo esta regra mensal, sem gerar receitas agora.</label><button disabled={locked}>Cadastrar regra mensal</button>
    </form> : <>
      <p data-testid="recurrence-summary">{rule.description} · BRL {amountInput(rule.amount.cents)} · Dia {rule.anchorDay} · {rule.startsOn} até {rule.endsOn ?? 'sem fim informado'} · {rule.occurrenceCount} ocorrência(s) · Versão {rule.version}</p>
      {rule.notes && <p>Notas: {rule.notes}</p>}<p>Estado: {rule.state === 'active' ? 'Ativa' : rule.state === 'paused' ? 'Pausada' : 'Cancelada definitivamente'}.</p>
      <RecurrenceLifecycle key={`lifecycle:${rule.id}`} rule={rule} api={api} parentBusy={busy || uncertain} setParentBusy={setLifecycleBusy} onChanged={current => { setRule(current); setPreview(null); setHistory(null); setRefresh(value => value + 1); }} />
      <form key={`generate:${rule.id}`} onSubmit={simulate} onChange={() => setPreview(null)}>
        <label>Primeiro mês da geração<input name="fromPeriod" type="month" min="0001-01" max="9999-12" required disabled={locked} /></label>
        <label>Último mês da geração<input name="toPeriod" type="month" min="0001-01" max="9999-12" required disabled={locked} /></label><button disabled={locked}>Consultar prévia da geração</button>
      </form>
      {preview && <div><p>{preview.counts.create} nova(s) · {preview.counts.existing} existente(s) · {preview.counts.outsideRule} fora da vigência · {preview.counts.blocked} bloqueada(s)</p>
        <div className="import-table" role="region" aria-label="Detalhes da prévia mensal" tabIndex={0}><table><caption>Prévia das ocorrências mensais</caption><thead><tr><th>Mês</th><th>Data pela regra</th><th>Valor BRL pela regra</th><th>Resultado</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.period}><td>{row.period}</td><td>{row.expectedOn}</td><td>{amountInput(row.amount.cents)}</td><td>{stateLabel[row.state]}{row.income && <span> · Atual: {row.income.facts.expectedOn.state === 'confirmed' ? row.income.facts.expectedOn.value : 'Data não informada'} · {row.income.facts.expectedAmount.state === 'confirmed' ? `BRL ${amountInput(row.income.facts.expectedAmount.value.cents)}` : 'Valor não informado'}</span>}</td></tr>)}</tbody></table></div>
        {rule.state === 'active' && <form key={preview.previewHash} onSubmit={event => { event.preventDefault(); if (!locked && !pending.current) void execute({ path: `/income-recurrences/${rule.id}/generate`, ruleId: rule.id, key: crypto.randomUUID(), body: { ...preview.range, expectedVersion: preview.rule.version, previewHash: preview.previewHash, generationConfirmed: true } }); }}>
          <label className="check"><input type="checkbox" required disabled={locked} />Revisei a prévia e confirmo a geração somente destas previsões, sem movimentar caixa.</label><button disabled={locked}>Gerar previsões mensais</button>
        </form>}
      </div>}
      <button className="secondary" disabled={locked} onClick={() => void open(rule.id)}>Recarregar regra</button>
      <button className="secondary" disabled={locked} onClick={async () => { setBusy(true); try { setHistory(await api(`/income-recurrences/${rule.id}/history`)); } catch (value) { error(value); } finally { setBusy(false); } }}>Consultar histórico da regra</button>
      {history && <div><h3>Histórico da regra — últimas 20 decisões</h3>{history.map(item => <p key={item.id}>Versão {item.version} · {item.createdAt} · {item.changes.action === 'generate' ? `Geração confirmada: ${item.changes.result?.created.length ?? 0} nova(s), ${item.changes.request?.range.fromPeriod} até ${item.changes.request?.range.toPeriod}` : actionLabel[item.changes.action] ?? item.changes.action}</p>)}</div>}
    </>}
  </section>;
}
