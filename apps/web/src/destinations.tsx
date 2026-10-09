import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { StatementFactsPanel } from './statement-facts';

interface Credit { id: string; name: string }
interface Card { id: string; name: string }
interface Statement { id: string; period: string }
type Api = (path: string, body?: unknown, idempotencyKey?: string, method?: 'GET' | 'POST' | 'PATCH') => Promise<any>;

export function Destinations({ accounts, api, onChanged, financialVersion }: { accounts: Credit[]; api: Api; onChanged: () => void; financialVersion: number }) {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [creditId, setCreditId] = useState('');
  const [cardId, setCardId] = useState('');
  const [statementId, setStatementId] = useState('');
  const [bankId, setBankId] = useState('');
  const [kind, setKind] = useState('bank');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  // Retry a lost response using the same key; changed input receives a new key.
  const retry = useRef(new Map<string, { payload: string; key: string }>());
  useEffect(() => {
    let active = true;
    void api('/credit-accounts').then(value => { if (active) setCredits(value); })
      .catch(() => { if (active) setMessage('Não foi possível carregar as contas de crédito.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!creditId) return;
    let active = true; setLoading(true);
    void Promise.all([api(`/credit-accounts/${creditId}/cards`), api(`/credit-accounts/${creditId}/statements`)])
      .then(([nextCards, nextStatements]) => { if (active) { setCards(nextCards); setStatements(nextStatements); } })
      .catch(() => { if (active) setMessage('Não foi possível carregar cartões e competências. Selecione a conta novamente para tentar.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [creditId]);
  function chooseCredit(value: string) {
    setCreditId(value); setCards([]); setStatements([]); setCardId(''); setStatementId(''); setMessage(''); setLoading(false);
  }
  async function create(event: FormEvent<HTMLFormElement>, resource: 'credit' | 'card' | 'statement') {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    const path = resource === 'credit' ? '/credit-accounts' : `/credit-accounts/${creditId}/${resource === 'card' ? 'cards' : 'statements'}`;
    const body = resource === 'statement' ? { period: data.get('period') } : resource === 'card' ? { name: data.get('name'), kind: data.get('kind') } : { name: data.get('name') };
    const payload = JSON.stringify(body);
    let attempt = retry.current.get(path);
    if (!attempt || attempt.payload !== payload) { attempt = { payload, key: crypto.randomUUID() }; retry.current.set(path, attempt); }
    setBusy(true); setMessage('');
    try {
      const value = await api(path, body, attempt.key); retry.current.delete(path);
      if (resource === 'credit') { setCredits(previous => previous.some(item => item.id === value.id) ? previous : [...previous, value]); chooseCredit(value.id); }
      else if (resource === 'card') { setCards(previous => previous.some(item => item.id === value.id) ? previous : [...previous, value]); setCardId(value.id); }
      else { setStatements(previous => previous.some(item => item.id === value.id) ? previous : [...previous, value].sort((a, b) => a.period.localeCompare(b.period))); setStatementId(value.id); }
      form.reset(); setMessage(resource === 'statement' ? 'Competência cadastrada e confirmada.' : resource === 'card' ? 'Cartão cadastrado.' : 'Conta de crédito cadastrada.');
      onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  const selectedStatement = statements.find(value => value.id === statementId);
  const selectedCredit = credits.find(value => value.id === creditId);
  const selectedBank = accounts.find(value => value.id === bankId);
  return <>
    <section aria-labelledby="credit-title" aria-busy={busy || loading}>
      <h2 id="credit-title">Crédito e cartões</h2>
      <p>Cartões físicos, virtuais e adicionais podem compartilhar uma conta de crédito e suas faturas.</p>
      {message && <p role="status">{message}</p>}
      <form onSubmit={event => void create(event, 'credit')}>
        <label>Nome da conta de crédito<input name="name" required maxLength={100} /></label>
        <button type="submit" disabled={busy || loading}>Adicionar conta de crédito</button>
      </form>
      <label className="destination-select">Conta de crédito<select value={creditId} disabled={busy} onChange={event => chooseCredit(event.target.value)}>
        <option value="">Selecione uma conta</option>{credits.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
      </select></label>
      {creditId && <div className="destination-forms">
        <form onSubmit={event => void create(event, 'card')}>
          <h3>Cadastrar cartão</h3>
          <label>Nome do cartão<input name="name" required maxLength={100} /></label>
          <label>Tipo do cartão<select name="kind" required defaultValue=""><option value="" disabled>Selecione o tipo</option><option value="physical">Físico</option><option value="virtual">Virtual</option><option value="additional">Adicional</option></select></label>
          <button type="submit" disabled={busy || loading}>Adicionar cartão</button>
        </form>
        <form onSubmit={event => void create(event, 'statement')}>
          <h3>Cadastrar competência</h3>
          <label>Competência da fatura<input name="period" type="month" min="0001-01" max="9999-12" required aria-describedby="period-hint" /></label>
          <small id="period-hint">Informe o mês da fatura. O intervalo do extrato não determina essa competência.</small>
          <button type="submit" disabled={busy || loading}>Confirmar competência</button>
        </form>
      </div>}
    </section>
    {creditId && statements.length > 0 && <StatementFactsPanel key={creditId} creditId={creditId} statements={statements} api={api} financialVersion={financialVersion} />}
    <section aria-labelledby="destination-title" aria-busy={loading}>
      <h2 id="destination-title">Destino para importar</h2>
      <label>Tipo de destino<select value={kind} disabled={busy} onChange={event => setKind(event.target.value)}><option value="bank">Conta bancária ou carteira</option><option value="card">Conta de crédito</option></select></label>
      {kind === 'bank' ? <label className="destination-select">Conta de destino<select value={bankId} onChange={event => setBankId(event.target.value)}>
        <option value="">Selecione uma conta</option>{accounts.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
      </select></label> : <>
        <p>{selectedCredit ? `Conta de crédito selecionada: ${selectedCredit.name}.` : 'Selecione uma conta de crédito acima.'}</p>
        <label>Cartão de destino (opcional)<select value={cardId} disabled={!creditId || loading || busy} onChange={event => setCardId(event.target.value)}><option value="">Sem cartão identificado</option>{cards.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
        <label className="destination-select">Período de destino<select value={statementId} disabled={!creditId || loading || busy} onChange={event => setStatementId(event.target.value)}><option value="">Selecione uma competência confirmada</option>{statements.map(value => <option key={value.id} value={value.id}>{value.period}</option>)}</select></label>
      </>}
      <p data-testid="destination-summary">{kind === 'bank' ? selectedBank ? `Destino selecionado: ${selectedBank.name}.` : 'Selecione uma conta de destino.' : selectedCredit && selectedStatement ? `Destino selecionado: ${selectedCredit.name}, competência ${selectedStatement.period}${cardId ? `, cartão ${cards.find(value => value.id === cardId)?.name}` : ', sem cartão identificado'}.` : 'Informe uma conta de crédito e a competência da fatura.'}</p>
      <p className="note">Ao revisar um arquivo abaixo, salve o destino de cada bloco. Esta seleção é apenas uma consulta aos cadastros disponíveis.</p>
    </section>
  </>;
}
