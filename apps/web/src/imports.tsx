import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ImportCandidate, KnownValue } from '@rovere/domain';
import { amountInput, centsInput } from './money-input';

interface Destination { id: string; name: string }
interface Block { id: string; kind: 'bank' | 'card'; metadata: { account: Record<string, string> }; financialAccountId: string | null; creditAccountId: string | null; cardId: string | null; statementId: string | null; periodOverride: boolean }
interface Result { created: number; linked: number; skipped: number; totals: { kind: string; accountId: string; statementId: string | null; selectedCents: string; newCents: string }[] }
interface Preview extends Result { version: number; blockerCount: number; blockers: { ordinal: number; code: string }[] }
interface Batch { id: string; filename: string; format: string; status: string; version: number; size: number; rowCount: number; errorCode: string | null; configuration: unknown; blocks?: Block[]; confirmation?: { result: Result } | null }
interface Row { id: string; selected: boolean; action: string; linkId: string | null; distinctFrom: string | null; matches: { id: string; description: string; postedOn: string; cents: string; reason: string; compatible: boolean }[]; candidate: ImportCandidate; source: { ordinal: number; blockId: string; raw: string }; originalCandidate: ImportCandidate }
interface Page { version: number; page: number; pageSize: number; total: number; rows: Row[] }
const messages: Record<string, string> = {
  REVIEW_CONFLICT: 'A revisão mudou em outra aba. Dados recarregados; confira antes de salvar novamente.',
  FILE_TOO_LARGE: 'O arquivo excede 10 MiB.', IMPORT_QUOTA: 'Remova importações anteriores antes de enviar outro arquivo.',
  INVALID_CONFIGURATION: 'Confira o mapeamento e os formatos do CSV.', INVALID_CORRECTIONS: 'Confira a data, o valor e as parcelas.',
  STATEMENT_PERIOD_REQUIRED: 'Falta competência confirmada.', STATEMENT_PERIOD_CONFLICT: 'Competência diferente da informada no arquivo.',
  DESTINATION_REQUIRED: 'Falta selecionar o destino.', INVALID_FIELD: 'Campo inválido no arquivo.', MISSING_FIELD: 'Campo ausente no arquivo.',
  UNSUPPORTED_CURRENCY: 'Moeda não suportada; informe explicitamente o valor em BRL.', COLUMN_COUNT_MISMATCH: 'Quantidade de colunas diferente do cabeçalho.',
  INVALID_INSTALLMENT: 'Confira as parcelas.', INVALID_CSV_COLUMNS: 'O mapeamento não corresponde aos cabeçalhos do CSV.',
  CONFIRMATION_CONFLICT: 'A revisão mudou ou já foi confirmada. Dados recarregados.',
  CONFIRMATION_BLOCKED: 'Resolva as pendências da prévia antes de confirmar.',
  MATCH_REVIEW_REQUIRED: 'Possível duplicidade: escolha vincular, manter ambas ou ignorar.',
  EXTERNAL_IDENTITY_CONFLICT: 'O identificador de origem tem dados conflitantes. Revise antes de confirmar.',
  LINK_INCOMPATIBLE: 'O vínculo não corresponde aos dados financeiros confirmados.',
  ROW_INCOMPLETE: 'Há dados ou destino pendentes nesta linha.', INVALID_DESCRIPTION: 'Corrija a descrição para até 500 caracteres.',
  DISTINCT_MATCH_CHANGED: 'A correspondência mudou. Confira a decisão de manter ambas.',
  SUMMARY_TOTAL_OVERFLOW: 'A soma selecionada excede o intervalo monetário suportado. Ajuste a seleção.',
  SOURCE_CORRECTION_REQUIRES_REVIEW: 'A origem marcou uma correção de outro registro. Revise o ajuste financeiro antes de confirmar.',
  CURRENCY_METADATA_REQUIRES_REVIEW: 'Confirme explicitamente o valor liquidado em BRL.',
};
const statuses: Record<string, string> = { uploaded: 'Aguardando interpretação', parsing: 'Interpretando arquivo', review: 'Em revisão', confirmed: 'Confirmada', failed: 'Falha na interpretação', cancelled: 'Removida' };
function known<T>(value: KnownValue<T>): T | undefined { return value.state === 'confirmed' ? value.value : undefined; }
class ApiError extends Error { constructor(public code: string) { super(messages[code] ?? 'Não foi possível concluir. Confira os dados e tente novamente.'); } }
export function Imports({ accounts, onExpired, catalogVersion }: { accounts: Destination[]; onExpired: () => void; catalogVersion: number }) {
  const [batches, setBatches] = useState<Batch[]>([]); const [batchId, setBatchId] = useState(''); const [batch, setBatch] = useState<Batch | null>(null);
  const [rows, setRows] = useState<Page | null>(null); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [format, setFormat] = useState('csv'); const [credits, setCredits] = useState<Destination[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [editor, setEditor] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const editingBusy = busy || reviewLoading;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [entries, setEntries] = useState<{ total: number; rows: { id: string; postedOn: string; description: string; amount: { cents: string }; notes: string | null }[] } | null>(null);
  const confirmAttempt = useRef(new Map<string, { version: number; key: string }>());
  const uploadAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401) onExpired(); throw new ApiError(data.code ?? 'INVALID_REQUEST'); }
    return data;
  }
  useEffect(() => {
    let active = true;
    void Promise.all([api('/imports'), api('/credit-accounts')]).then(([values, destinations]) => {
      if (active) { setBatches(values); setCredits(destinations); }
    }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [refresh, catalogVersion]);
  useEffect(() => {
    if (!batchId) return;
    setPreview(null); setReviewLoading(true);
    let active = true; let timer: ReturnType<typeof setTimeout>; const controller = new AbortController();
    async function load() {
      try {
        const value: Batch = await api(`/imports/${batchId}`, { signal: controller.signal });
        if (!active) return;
        if (['review', 'confirmed'].includes(value.status)) {
          const result = await api(`/imports/${batchId}/rows?page=${page}&pageSize=25`, { signal: controller.signal });
          if (active && result.version === value.version) {
            setBatch(value); setRows(result);
            if (value.status === 'review') {
              const summary = await api(`/imports/${batchId}/confirmation-preview`, { signal: controller.signal });
              if (active && summary.version === result.version) { setPreview(summary); setReviewLoading(false); }
              else if (active) timer = setTimeout(() => void load(), 500);
            } else if (active) setReviewLoading(false);
          }
          else if (active) timer = setTimeout(() => void load(), 500);
        } else { setBatch(value); setRows(null); setReviewLoading(false); if (['uploaded', 'parsing'].includes(value.status)) timer = setTimeout(() => void load(), 1000); }
      } catch (error) { if (active) { setReviewLoading(false); setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); } }
    }
    void load(); return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [batchId, page, refresh]);
  function open(id: string) { setBatchId(id); setBatch(null); setRows(null); setPreview(null); setReviewLoading(true); setEntries(null); setPage(1); setEditor(null); setMessage(''); setRefresh(value => value + 1); }
  async function mutate(path: string, body: unknown, method = 'PATCH') {
    setBusy(true); setMessage('');
    try { await api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); setMessage('Revisão salva.'); setRefresh(value => value + 1); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); setRefresh(value => value + 1); return false; }
    finally { setReviewLoading(true); setBusy(false); }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const file = data.get('file') as File;
    if (!file.size || file.size > 10 * 1024 * 1024) { setMessage('Envie um arquivo de até 10 MiB.'); return; }
    const columns: Record<string, string> = { date: String(data.get('date')), description: String(data.get('description')), amount: String(data.get('amount')) };
    for (const name of ['externalId', 'installmentNumber', 'installmentTotal', 'statementPeriod']) if (data.get(name)) columns[name] = String(data.get(name));
    const configuration = format === 'ofx' ? data.get('encoding') === 'source' ? {} : { encoding: data.get('encoding') } : { profile: {
      id: 'generic-ui-v1', encoding: data.get('encoding'), delimiter: data.get('delimiter'), headerLine: Number(data.get('headerLine')),
      dateFormat: data.get('dateFormat'), decimal: data.get('decimal'), grouping: data.get('grouping') === 'none' ? null : data.get('grouping'),
      sign: data.get('sign'), currency: 'BRL', kind: data.get('kind'), columns,
    } };
    const serialized = JSON.stringify(configuration);
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const fingerprint = `${format}:${file.name}:${serialized}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
    let attempt = uploadAttempt.current;
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = { fingerprint, key: crypto.randomUUID() }; uploadAttempt.current = attempt;
    }
    const form = new FormData(); form.append('file', file); form.append('format', format); form.append('configuration', serialized);
    setBusy(true); setMessage('');
    try {
      const value = await api('/imports', { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: form });
      uploadAttempt.current = null; setRefresh(value => value + 1); open(value.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  async function edit(event: FormEvent<HTMLFormElement>, row: Row) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const corrections: Record<string, unknown> = {};
    if (data.get('date') && data.get('date') !== known(row.candidate.postedOn)) corrections.postedOn = data.get('date');
    if (data.get('description') && data.get('description') !== known(row.candidate.description)) corrections.description = data.get('description');
    try {
      if (data.get('amount')) { const cents = centsInput(String(data.get('amount'))); if (cents !== known(row.candidate.amount)?.cents) corrections.amount = { currency: 'BRL', cents }; }
      const installment = known(row.candidate.installment);
      if (data.get('number')) {
        const number = Number(data.get('number')); const total = data.get('total') ? Number(data.get('total')) : null;
        if (number !== installment?.number || total !== (installment ? known(installment.total) ?? null : null)) corrections.installment = { number, total };
      }
      if (!Object.keys(corrections).length) { setMessage('Nenhuma alteração informada.'); return; }
      if (await mutate(`/imports/${batchId}/review`, { expectedVersion: rows!.version, rows: [{ id: row.id, corrections }] })) setEditor(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Confira a correção.'); }
  }
  async function confirm() {
    if (!preview || preview.blockerCount || !rows || preview.version !== rows.version) return;
    let attempt = confirmAttempt.current.get(batchId);
    if (!attempt || attempt.version !== rows.version) { attempt = { version: rows.version, key: crypto.randomUUID() }; confirmAttempt.current.set(batchId, attempt); }
    setBusy(true); setMessage('');
    try {
      await api(`/imports/${batchId}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key }, body: JSON.stringify({ expectedVersion: attempt.version }) });
      setMessage('Importação confirmada. Resultado salvo.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão. Confira o resultado ao recarregar.'); }
    finally { setBusy(false); setRefresh(value => value + 1); }
  }
  async function loadEntries(block: Block) {
    const accountId = block.kind === 'bank' ? block.financialAccountId : block.creditAccountId;
    setBusy(true);
    try { setEntries(await api(`/entries?kind=${block.kind}&accountId=${encodeURIComponent(accountId!)}${block.statementId ? `&statementId=${encodeURIComponent(block.statementId)}` : ''}`)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); } finally { setBusy(false); }
  }
  return <section aria-labelledby="imports-title" aria-busy={busy}>
    <h2 id="imports-title">Importar e revisar</h2>
    <p>Envie CSV ou OFX, confira os registros e confirme a seleção. Valores com o sinal informado na origem; saldo, limite e total de compra não são deduzidos.</p>
    {message && <p role="status">{message}</p>}
    <form onSubmit={event => void upload(event)}>
      <label>Formato do arquivo<select value={format} onChange={event => setFormat(event.target.value)} disabled={busy}><option value="csv">CSV</option><option value="ofx">OFX</option></select></label>
      <label>Arquivo para revisão<input name="file" type="file" accept={`.${format}`} required disabled={busy} /></label>
      <label>Encoding do arquivo<select name="encoding" key={format} defaultValue={format === 'csv' ? 'utf-8' : 'source'}>{format === 'ofx' && <option value="source">Usar declaração do arquivo (UTF-8 quando ausente)</option>}<option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252</option></select></label>
      {format === 'csv' && <fieldset><legend>Configuração do CSV</legend>
        <label>Natureza do CSV<select name="kind" defaultValue="bank"><option value="bank">Extrato bancário</option><option value="card">Fatura de cartão</option></select></label>
        <label>Separador de colunas<select name="delimiter" defaultValue=";"><option value=";">Ponto e vírgula</option><option value=",">Vírgula</option><option value={'\t'}>Tabulação</option></select></label>
        <label>Linha do cabeçalho<input name="headerLine" type="number" min={1} max={100} defaultValue={1} required /></label>
        <label>Formato da data<select name="dateFormat" defaultValue="DMY"><option value="DMY">DD/MM/AAAA</option><option value="YMD">AAAA-MM-DD</option><option value="MDY">MM/DD/AAAA</option></select></label>
        <label>Separador decimal<select name="decimal" defaultValue=","><option value=",">Vírgula</option><option value=".">Ponto</option></select></label>
        <label>Separador de milhares<select name="grouping" defaultValue="."><option value="none">Nenhum</option><option value=".">Ponto</option><option value=",">Vírgula</option></select></label>
        <label>Sinal dos valores<select name="sign" defaultValue="as-is"><option value="as-is">Preservar sinal informado</option><option value="invert">Inverter sinal explicitamente</option></select></label>
        <label>Coluna de data<input name="date" defaultValue="Data" maxLength={100} required /></label>
        <label>Coluna de descrição<input name="description" defaultValue="Descrição" maxLength={100} required /></label>
        <label>Coluna de valor<input name="amount" defaultValue="Valor" maxLength={100} required /></label>
        <details><summary>Colunas opcionais</summary>{[['externalId', 'Identificador externo'], ['installmentNumber', 'Número da parcela'], ['installmentTotal', 'Quantidade de parcelas'], ['statementPeriod', 'Competência (AAAA-MM)']].map(([name, label]) => <label key={name}>{label}<input name={name} maxLength={100} /></label>)}</details>
        <label className="check"><input type="checkbox" required />Conferi o mapeamento, a moeda BRL e os formatos acima.</label>
      </fieldset>}
      <button type="submit" disabled={busy}>Enviar para revisão</button>
    </form>
    <h3>Importações recentes</h3>
    {batches.length === 0 ? <p>Nenhum arquivo enviado.</p> : <div className="import-list">{batches.map(value => <button className="secondary" key={value.id} disabled={busy} onClick={() => open(value.id)}>{value.filename} — {statuses[value.status] ?? value.status}</button>)}</div>}
    {batchId && !batch && <p>Carregando importação…</p>}
    {batch && <div className="import-review">
      <h3>Revisão de {batch.filename}</h3>
      <p data-testid="import-status">{statuses[batch.status] ?? batch.status}{batch.status === 'review' ? ` · ${batch.rowCount} registros` : ''}</p>
      {batch.size > 0 && batch.status !== 'cancelled' && <a href={`/api/imports/${batch.id}/file`}>Baixar arquivo original</a>}
      {batch.status === 'failed' && <><p>{messages[batch.errorCode ?? ''] ?? 'Não foi possível interpretar o arquivo. Confira o formato e a configuração.'}</p><button disabled={editingBusy} onClick={() => void mutate(`/imports/${batchId}/retry`, { expectedVersion: batch.version }, 'POST')}>Tentar novamente</button><p className="note">Para alterar o mapeamento, envie uma nova revisão com a configuração corrigida.</p></>}
      {batch.status === 'review' && rows && <>
        {batch.blocks?.map(block => <BlockDestination key={`${batch.id}:${block.id}:${rows.version}`} block={block} accounts={accounts} credits={credits} busy={editingBusy} catalogVersion={catalogVersion}
          api={api} save={target => mutate(`/imports/${batchId}/review`, { expectedVersion: rows.version, blocks: [{ id: block.id, ...target }] })} />)}
        <div className="import-actions"><button className="secondary" disabled={editingBusy} onClick={() => void mutate(`/imports/${batchId}/review`, { expectedVersion: rows.version, all: { selected: true } })}>Selecionar todas as linhas</button><button className="secondary" disabled={editingBusy} onClick={() => void mutate(`/imports/${batchId}/review`, { expectedVersion: rows.version, all: { selected: false } })}>Excluir todas da seleção</button><button className="secondary" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Recarregar revisão</button></div>
        <div className="import-actions"><button className="secondary" disabled={editingBusy} onClick={() => void mutate(`/imports/${batchId}/review`, { expectedVersion: rows.version, all: { reconcile: 'link' } })}>Vincular sugestões únicas da seleção</button><button className="secondary" disabled={editingBusy} onClick={() => void mutate(`/imports/${batchId}/review`, { expectedVersion: rows.version, all: { reconcile: 'distinct' } })}>Manter ambas nas sugestões da seleção</button></div>
        <p className="note">Essas decisões em lote preservam linhas excluídas e decisões já salvas. Correspondências ambíguas continuam pendentes.</p>
        <div className="import-table" tabIndex={0} aria-label="Registros da revisão"><table><thead><tr><th>Seleção</th><th>Data</th><th>Descrição</th><th>Valor BRL</th><th>Revisão</th></tr></thead><tbody>{rows.rows.map(row => <tr key={row.id}>
          <td><input aria-label={`Selecionar linha ${row.source.ordinal}`} type="checkbox" checked={row.selected} disabled={editingBusy} onChange={event => {
            const selected = event.target.checked;
            setRows(previous => previous ? { ...previous, rows: previous.rows.map(value => value.id === row.id ? { ...value, selected } : value) } : previous);
            void mutate(`/imports/${batchId}/review`, { expectedVersion: rows.version, rows: [{ id: row.id, selected }] });
          }} /></td>
          <td>{known(row.candidate.postedOn) ?? 'Desconhecida'}</td><td>{known(row.candidate.description) ?? 'Ausente'}<details><summary>Origem da linha {row.source.ordinal}</summary><pre>{row.source.raw}</pre></details></td>
          <td>{amountInput(known(row.candidate.amount)?.cents) || 'Desconhecido'}</td><td>{row.selected ? row.candidate.issues.length ? row.candidate.issues.map(issue => messages[issue.code] ?? 'Confira este campo.').join(' ') : row.matches.some(match => match.reason === 'similar') && row.action === 'create' && !row.distinctFrom ? 'Confira a possível duplicidade.' : 'Dados conhecidos; confira a prévia.' : 'Excluída da seleção'}<button className="secondary" disabled={editingBusy} onClick={() => setEditor(row.id)}>Corrigir linha {row.source.ordinal}</button>
            {(row.matches.length > 0 || row.action === 'link' || row.distinctFrom) && <label>Decisão da linha {row.source.ordinal}<select disabled={editingBusy} value={!row.selected ? 'skip' : row.action === 'link' ? `link:${row.linkId}` : row.distinctFrom ? `distinct:${row.distinctFrom}` : 'create'} onChange={event => {
              const choice = event.target.value; const [action, recordId] = choice.split(':');
              void mutate(`/imports/${batchId}/review`, { expectedVersion: rows.version, rows: [{ id: row.id,
                ...(action === 'link' ? { action: 'link', existingId: recordId } : action === 'distinct' ? { action: 'create', distinctFrom: recordId } : { action }) }] });
            }}>
              <option value="create">{row.matches.some(match => match.reason === 'external') ? 'Reconhecer pela identidade de origem' : 'Escolha uma decisão'}</option>
              {row.linkId && !row.matches.some(match => match.id === row.linkId) && <option value={`link:${row.linkId}`}>Vínculo salvo; confira os dados</option>}
              {row.distinctFrom && !row.matches.some(match => match.id === row.distinctFrom) && <option value={`distinct:${row.distinctFrom}`}>Decisão de manter ambas salva</option>}
              {row.matches.map(match => <option key={`link:${match.id}`} value={`link:${match.id}`} disabled={!match.compatible}>Vincular: {match.description} · {amountInput(match.cents)}</option>)}
              {!row.matches.some(match => match.reason === 'external') && row.matches.map(match => <option key={`distinct:${match.id}`} value={`distinct:${match.id}`}>Manter ambas: {match.description}</option>)}
              <option value="skip">Ignorar esta linha</option>
            </select></label>}
          </td>
        </tr>)}</tbody></table></div>
        <nav aria-label="Páginas da revisão"><button className="secondary" disabled={busy || page === 1} onClick={() => { setRows(null); setPage(value => value - 1); setEditor(null); }}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(rows.total / rows.pageSize))}</span><button className="secondary" disabled={busy || page * rows.pageSize >= rows.total} onClick={() => { setRows(null); setPage(value => value + 1); setEditor(null); }}>Próxima</button></nav>
        {rows.rows.filter(row => row.id === editor).map(row => <form className="row-editor" key={row.id} onSubmit={event => void edit(event, row)}>
          <h3>Corrigir linha {row.source.ordinal}</h3>
          <label>Data corrigida<input type="date" name="date" defaultValue={known(row.candidate.postedOn) ?? ''} /></label>
          <label>Descrição corrigida<input name="description" maxLength={500} defaultValue={known(row.candidate.description) ?? ''} /></label>
          <label>Valor corrigido em reais<input name="amount" inputMode="decimal" defaultValue={amountInput(known(row.candidate.amount)?.cents)} aria-describedby="amount-hint" /></label><small id="amount-hint">Moeda BRL; preserve o sinal. Exemplo: -12,34. Sem separador de milhares.</small>
          <label>Número da parcela confirmado<input type="number" name="number" min={1} max={10000} defaultValue={known(row.candidate.installment)?.number ?? ''} /></label>
          <label>Quantidade de parcelas confirmada (opcional)<input type="number" name="total" min={1} max={10000} defaultValue={known(row.candidate.installment) ? known(known(row.candidate.installment)!.total) ?? '' : ''} /></label>
          <small>Preencha parcelas somente quando confirmadas. Sugestões da descrição não são aplicadas automaticamente.</small>
          <button disabled={editingBusy}>Salvar correção</button><button className="secondary" type="button" onClick={() => setEditor(null)}>Fechar correção</button>
          <button className="secondary" type="button" disabled={editingBusy} onClick={() => void mutate(`/imports/${batchId}/review`, { expectedVersion: rows.version, rows: [{ id: row.id, corrections: { postedOn: null, description: null, amount: null, installment: null } }] }).then(saved => { if (saved) setEditor(null); })}>Restaurar dados da origem</button>
        </form>)}
        <div className="confirmation-summary"><h3>Prévia da confirmação</h3>
          {!preview ? <p>Validando seleção e correspondências…</p> : <>
            <p data-testid="confirmation-preview">{preview.created} novos · {preview.linked} vinculados · {preview.skipped} ignorados</p>
            {preview.blockerCount > 0 && <><p>{preview.blockerCount} pendências impedem a confirmação. Os totais abaixo consideram somente linhas aptas.</p><ul>{preview.blockers.map((blocker, index) => <li key={index}>Linha {blocker.ordinal}: {messages[blocker.code] ?? 'Confira os dados e a decisão desta linha.'}</li>)}</ul></>}
            {preview.totals.map(total => <p key={`${total.kind}:${total.accountId}:${total.statementId}`}>{(total.kind === 'bank' ? accounts : credits).find(value => value.id === total.accountId)?.name ?? 'Destino confirmado'}: selecionado BRL {amountInput(total.selectedCents)} · novos registros BRL {amountInput(total.newCents)}</p>)}
          </>}
          <button disabled={editingBusy || !preview || preview.blockerCount > 0 || preview.version !== rows.version} onClick={() => void confirm()}>Confirmar registros selecionados</button>
        </div>
        <p className="note">A revisão pode ser retomada após sair ou recarregar. A confirmação salva o conjunto selecionado de uma só vez.</p>
      </>}
      {batch.status === 'confirmed' && batch.confirmation && <div className="confirmation-summary">
        <h3>Resultado da importação</h3><p data-testid="confirmation-result">{batch.confirmation.result.created} novos · {batch.confirmation.result.linked} vinculados · {batch.confirmation.result.skipped} ignorados</p>
        {batch.blocks?.map(block => <button key={block.id} className="secondary" disabled={busy || !(block.financialAccountId || block.creditAccountId)} onClick={() => void loadEntries(block)}>Consultar registros do bloco {block.id.split(':').at(-1)}</button>)}
        {entries && <><p data-testid="entry-total">{entries.total} registros nesta conta{batch.blocks?.[0]?.kind === 'card' ? '/competência' : ''}. Mostrando os primeiros 25.</p><div className="import-table"><table aria-label="Registros financeiros"><thead><tr><th>Data</th><th>Descrição</th><th>Valor BRL</th></tr></thead><tbody>{entries.rows.map(entry => <tr key={entry.id}><td>{entry.postedOn}</td><td>{entry.description}{entry.notes && <p>{entry.notes}</p>}</td><td>{amountInput(entry.amount.cents)}</td></tr>)}</tbody></table></div></>}
        {batch.size > 0 && <button className="secondary" disabled={editingBusy} onClick={() => void mutate(`/imports/${batchId}/file`, { expectedVersion: batch.version }, 'DELETE')}>Remover somente arquivo original</button>}
      </div>}
      {['uploaded', 'review', 'failed'].includes(batch.status) && <button className="secondary" disabled={editingBusy} onClick={() => void mutate(`/imports/${batchId}`, { expectedVersion: batch.version }, 'DELETE')}>Remover importação e arquivo</button>}
    </div>}
  </section>;
}

function BlockDestination({ block, accounts, credits, busy, api, save, catalogVersion }: { block: Block; accounts: Destination[]; credits: Destination[]; busy: boolean; catalogVersion: number;
  api: (path: string) => Promise<any>; save: (target: Record<string, unknown>) => Promise<boolean> }) {
  const [creditId, setCreditId] = useState(block.creditAccountId ?? ''); const [cards, setCards] = useState<Destination[]>([]);
  const [cardId, setCardId] = useState(block.cardId ?? ''); const [statementId, setStatementId] = useState(block.statementId ?? '');
  const [statements, setStatements] = useState<{ id: string; period: string }[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    setCards([]); setStatements([]); if (!creditId) { setLoading(false); return; }
    let active = true; setLoading(true);
    void Promise.all([api(`/credit-accounts/${creditId}/cards`), api(`/credit-accounts/${creditId}/statements`)]).then(([a, b]) => {
      if (active) { setCards(a); setStatements(b); setError(''); }
    }).catch(() => { if (active) setError('Não foi possível carregar este destino. Selecione novamente.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [creditId, catalogVersion]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await save(block.kind === 'bank' ? { financialAccountId: data.get('account') || null } : { creditAccountId: creditId || null, cardId: data.get('card') || null, statementId: data.get('statement') || null, periodOverride: data.get('override') === 'on' });
  }
  return <form className="block-destination" onSubmit={event => void submit(event)}>
    <h4>Destino do bloco {block.id.split(':').at(-1)}</h4>
    <p className="note">{block.kind === 'bank' ? 'Extrato bancário' : 'Cartão'} · Identificação na origem: {Object.values(block.metadata.account).join(' / ') || 'Não informada'}</p>
    {error && <p role="status">{error}</p>}
    {block.kind === 'bank' ? <label>Conta para este bloco<select name="account" defaultValue={block.financialAccountId ?? ''}><option value="">Destino ainda desconhecido</option>{accounts.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label> : <>
      <label>Crédito para este bloco<select value={creditId} onChange={event => { setCreditId(event.target.value); setCardId(''); setStatementId(''); }}><option value="">Destino ainda desconhecido</option>{credits.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <div key={creditId}><label>Cartão para este bloco<select name="card" disabled={loading || !creditId} value={cardId} onChange={event => setCardId(event.target.value)}><option value="">Cartão desconhecido</option>{cards.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label>Competência para este bloco<select name="statement" disabled={loading || !creditId} value={statementId} onChange={event => setStatementId(event.target.value)}><option value="">Competência ainda não confirmada</option>{statements.map(value => <option key={value.id} value={value.id}>{value.period}</option>)}</select></label></div>
      <label className="check"><input name="override" type="checkbox" defaultChecked={block.periodOverride} />Confirmo a competência escolhida, inclusive se divergir da origem.</label>
    </>}
    <button disabled={busy || loading} type="submit">Salvar destino do bloco {block.id.split(':').at(-1)}</button>
  </form>;
}
