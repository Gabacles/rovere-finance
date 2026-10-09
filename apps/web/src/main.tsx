import { StrictMode, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Destinations } from './destinations';
import { Imports } from './imports';
import { Expenses } from './expenses';

function App() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [token] = useState(() => new URLSearchParams(location.search).get('token'));
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>(token ? 'reset' : 'login');
  const [message, setMessage] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.has('error') ? 'O link é inválido ou expirou. Solicite outro.' : params.has('verified') ? 'Email confirmado. Entre para continuar.' : '';
  });
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [financialVersion, setFinancialVersion] = useState(0);
  async function api(path: string, body?: unknown, idempotencyKey?: string, method: 'GET' | 'POST' | 'PATCH' = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`/api${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, credentials: 'same-origin',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/auth/')) { setUser(null); setAccounts([]); }
      const errors: Record<string, string> = {
        EMAIL_NOT_VERIFIED: 'Confirme seu email antes de entrar.',
        INVALID_EMAIL_OR_PASSWORD: 'Email ou senha inválidos.',
        INVALID_TOKEN: 'O link é inválido ou expirou. Solicite outro.',
        INVALID_NAME: 'O nome deve conter de 1 a 100 caracteres.',
        INVALID_STATEMENT_PERIOD: 'Informe uma competência válida no formato AAAA-MM.',
        STATEMENT_PERIOD_EXISTS: 'Esta competência já está cadastrada. Selecione o período existente.',
        IDEMPOTENCY_CONFLICT: 'Os dados deste envio mudaram. Confira e tente novamente.',
        INVALID_STATEMENT_FACTS: 'Confira as datas, o ciclo e o total declarado em BRL.',
        STATEMENT_VERSION_CONFLICT: 'A fatura mudou em outra edição. Recarregue os dados antes de salvar.',
        STATEMENT_NOT_FOUND: 'Fatura não encontrada.',
        INVALID_EXPENSE: 'Confira descrição, data original e total não negativo em BRL.',
        EXPENSE_VERSION_CONFLICT: 'A compra mudou em outra edição. Recarregue os dados antes de salvar.',
        EXPENSE_NOT_FOUND: 'Compra não encontrada.',
        CHARGE_NOT_FOUND: 'Cobrança não encontrada.',
        CHARGE_ALREADY_LINKED: 'A cobrança já está associada a uma compra. Recarregue os dados.',
        CHARGE_LINK_CONFLICT: 'O vínculo mudou. Recarregue os dados.',
        INVALID_INSTALLMENT_PLAN: 'Confira total, quantidade, crédito, competências e valor efetivo em BRL.',
        PLAN_TOTAL_REQUIRED: 'Confirme o total da compra e use o mesmo valor no plano.',
        PLAN_TOTAL_LOCKED: 'O total tem um plano confirmado. A revisão do plano ainda não está disponível nesta versão.',
        INSTALLMENT_PLAN_EXISTS: 'Esta compra já tem um plano confirmado. Recarregue os dados.',
        INSTALLMENT_PLAN_REQUIRED: 'Confirme um plano antes de conciliar parcelas.',
        INSTALLMENT_INCOMPATIBLE: 'Crédito, competência, parcela ou valor confirmado não correspondem à cobrança.',
        INSTALLMENT_ALREADY_MATCHED: 'Esta parcela já tem cobrança conciliada. Recarregue os dados.',
        CHARGE_ALREADY_MATCHED: 'A cobrança já está conciliada a uma parcela.',
        INSTALLMENT_MATCH_EXISTS: 'Desconcilie a parcela antes de desassociar a cobrança.',
        INSTALLMENT_NOT_MATCHED: 'Esta previsão não tem cobrança conciliada.',
        INVALID_CLASSIFICATION: 'Confirme natureza e magnitude do valor original em BRL.',
        CHARGE_VERSION_CONFLICT: 'A cobrança mudou. Recarregue os dados antes de salvar.',
        CLASSIFICATION_DEPENDENCY: 'A natureza e a parcela conciliada não correspondem. Revise a classificação ou desconcilie a parcela explicitamente.',
        PAYMENT_CONFIRMATION_REQUIRED: 'Confirme a base antes de pagamentos, a obrigação independente e a saída bancária.',
        INVALID_PAYMENT_AMOUNT: 'Informe valor positivo, exato e em BRL.',
        PAYMENT_BASIS_UNAVAILABLE: 'A base mudou ou não está disponível. Confira saldo anterior, total e cobertura.',
        PAYMENT_BASIS_REVIEW_REQUIRED: 'Confirme ou revise a base da obrigação antes de alocar.',
        PAYMENT_TOTAL_BELOW_ALLOCATED: 'Reverta as alocações afetadas antes de reduzir a base abaixo do valor já alocado.',
        OUTFLOW_AMOUNT_MISMATCH: 'A magnitude confirmada deve corresponder à saída bancária original.',
        PAYMENT_SOURCE_EXCEEDED: 'O valor supera o disponível deste movimento bancário.',
        PAYMENT_BALANCE_EXCEEDED: 'O valor supera o saldo conhecido desta fatura.',
        BANK_VERSION_CONFLICT: 'O movimento mudou. Atualize pagamentos e movimentos antes de alocar.',
        BANK_ENTRY_NOT_FOUND: 'Movimento bancário não encontrado.',
        PAYMENT_SOURCE_CHANGED: 'A saída confirmada mudou e exige revisão.',
        PAYMENT_ALLOCATION_NOT_FOUND: 'Alocação não encontrada.',
        PAYMENT_ALREADY_REVERSED: 'Esta alocação já foi revertida.',
      };
      throw new Error(response.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : errors[data.code as string] ?? 'Não foi possível concluir. Confira os dados e tente novamente.');
    }
    return data;
  }
  useEffect(() => {
    history.replaceState(null, '', location.pathname);
    // A recovery link takes precedence over an existing browser session.
    if (token) { setLoading(false); return; }
    let active = true;
    void fetch('/api/me').then(async response => {
      if (response.ok) { const value = await response.json(); if (active) setUser(value); }
      else if (response.status !== 401) throw new Error();
    }).catch(() => { if (active) setMessage('Não foi possível conectar. Recarregue a página para tentar novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void api('/accounts').then(value => { if (active) setAccounts(value); })
      .catch(() => { if (active) setMessage('Não foi possível carregar suas contas.'); });
    return () => { active = false; };
  }, [user]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setMessage('');
    try {
      const email = String(data.get('email') ?? ''); const password = String(data.get('password') ?? '');
      if (user) {
        const account = await api('/accounts', { name: data.get('name') });
        setAccounts(previous => [...previous, account]); form.reset(); setMessage('Conta cadastrada.');
      } else if (mode === 'login') {
        await api('/auth/sign-in/email', { email, password }); setUser(await api('/me'));
      } else if (mode === 'signup') {
        await api('/auth/sign-up/email', { name: data.get('name'), email, password, callbackURL: `${location.origin}/?verified=1` });
        setMode('login'); form.reset(); setMessage('Confira seu email para confirmar o cadastro.');
      } else if (mode === 'forgot') {
        await api('/auth/request-password-reset', { email, redirectTo: `${location.origin}/?reset=1` });
        setMessage('Se esse email estiver cadastrado, você receberá um link para redefinir sua senha.');
      } else {
        await api('/auth/reset-password', { token, newPassword: password });
        setMode('login'); form.reset(); setMessage('Senha redefinida. Entre novamente.');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  async function signout() {
    setBusy(true);
    try { await api('/auth/sign-out', {}); setUser(null); setAccounts([]); setMode('login'); setMessage('Você saiu da sua conta.'); }
    catch { setMessage('Não foi possível sair. Tente novamente.'); }
    finally { setBusy(false); }
  }
  function changeMode(next: typeof mode) { setMode(next); setMessage(''); }
  return (
    <main>
      <span className="brand">ROVERE FINANCE</span>
      <h1>{user ? `Olá, ${user.name}.` : <>Clareza para cuidar<br />do seu dinheiro.</>}</h1>
      <p>Suas contas, compras e planos em um só lugar.</p>
      <section aria-labelledby="form-title" aria-busy={busy || loading}>
        {loading ? <p>Carregando…</p> : <>
          <h2 id="form-title">{user ? 'Suas contas' : { login: 'Entre na sua conta', signup: 'Crie sua conta', forgot: 'Recupere seu acesso', reset: 'Escolha uma nova senha' }[mode]}</h2>
          {message && <p role="status">{message}</p>}
          {user && <><p>{user.email}</p><ul>{accounts.map(account => <li key={account.id}>{account.name} <span className="currency">BRL</span></li>)}</ul>{accounts.length === 0 && <p>Você ainda não cadastrou uma conta.</p>}</>}
          <form key={user ? 'account' : mode} onSubmit={submit}>
            {(user || mode === 'signup') && <label>{user ? 'Nome da conta' : 'Seu nome'}<input name="name" required maxLength={100} autoComplete={user ? 'off' : 'name'} /></label>}
            {!user && mode !== 'reset' && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
            {!user && mode !== 'forgot' && <div><label>Senha<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 12} maxLength={128} required aria-describedby={mode !== 'login' ? 'password-hint' : undefined} /></label>{mode !== 'login' && <small id="password-hint">Use pelo menos 12 caracteres.</small>}</div>}
            <button disabled={busy} type="submit">{busy ? 'Aguarde…' : user ? 'Adicionar conta' : { login: 'Entrar', signup: 'Criar conta', forgot: 'Enviar link', reset: 'Salvar nova senha' }[mode]}</button>
          </form>
          <nav aria-label="Acesso à conta">
            {user ? <button className="secondary" disabled={busy} onClick={() => void signout()}>Sair</button> : <>
              {mode !== 'login' && <button className="secondary" disabled={busy} onClick={() => changeMode('login')}>Voltar para entrar</button>}
              {mode === 'login' && <><button className="secondary" disabled={busy} onClick={() => changeMode('signup')}>Criar conta</button><button className="secondary" disabled={busy} onClick={() => changeMode('forgot')}>Esqueci minha senha</button></>}
            </>}
          </nav>
          {user && <p className="note">Cadastre destinos abaixo, revise seus arquivos e confirme apenas os registros selecionados.</p>}
        </>}
      </section>
      {user && <Destinations key={`destinations:${user.email}`} accounts={accounts} api={api} onChanged={() => setCatalogVersion(value => value + 1)} financialVersion={financialVersion} />}
      {user && <Imports key={`imports:${user.email}`} accounts={accounts} catalogVersion={catalogVersion} onFinancialChanged={() => setFinancialVersion(value => value + 1)} onExpired={() => { setUser(null); setAccounts([]); }} />}
      {user && <Expenses key={`expenses:${user.email}`} api={api} catalogVersion={catalogVersion} />}
      <footer>Organização hoje. Tranquilidade amanhã.</footer>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Application root not found.');
createRoot(root).render(<StrictMode><App /></StrictMode>);
