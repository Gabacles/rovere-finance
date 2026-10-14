import { test, expect } from './fixtures';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mailLink } from '../../scripts/test-mail.mjs';

test('RF-028 receives CSV/OFX partially, recovers responses/conflicts and reverses without synthetic cash', async ({ page }) => {
  const origin = 'http://127.0.0.1:15173'; const email = `receipt-${randomUUID()}@rovere.test`; const password = 'Fictitious-browser-123!';
  expect((await page.request.post('/api/auth/sign-up/email', { headers: { Origin: origin }, data: { name: 'Pessoa fictícia', email, password } })).status()).toBe(200);
  await page.goto(await mailLink(email, 'Confirme')); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Nome da conta', { exact: true }).fill('Banco dos recebimentos'); await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click();
  const ofx = (await readFile('packages/importers/test/fixtures/bank-102.ofx', 'utf8')).replace('<TRNAMT>-120.00', '<TRNAMT>66.67').replace('<FITID>0001', '<FITID>receipt-ofx').replace('<NAME>Loja fictícia', '<NAME>Entrada OFX fictícia');
  for (const [format, content] of [['csv', 'Data;Descrição;Valor;ID\n08/11/2026;Entrada CSV fictícia;150,00;receipt-csv'], ['ofx', ofx]] as const) {
    await page.getByRole('combobox', { name: 'Formato do arquivo', exact: true }).selectOption(format);
    if (format === 'csv') { await page.getByText('Colunas opcionais', { exact: true }).click(); await page.getByLabel('Identificador externo', { exact: true }).fill('ID'); await page.getByLabel('Conferi o mapeamento, a moeda BRL e os formatos acima.').check(); }
    await page.getByLabel('Arquivo para revisão').setInputFiles({ name: `receipts.${format}`, mimeType: 'application/octet-stream', buffer: Buffer.from(content) });
    await page.getByRole('button', { name: 'Enviar para revisão', exact: true }).click(); await expect(page.getByTestId('import-status')).toContainText('Em revisão');
    await page.getByRole('combobox', { name: 'Conta para este bloco', exact: true }).selectOption({ label: 'Banco dos recebimentos' }); await page.getByRole('button', { name: 'Salvar destino do bloco 1', exact: true }).click();
    await expect(page.getByTestId('confirmation-preview')).toHaveText('1 novos · 0 vinculados · 0 ignorados'); await page.getByRole('button', { name: 'Confirmar registros selecionados', exact: true }).click(); await expect(page.getByTestId('confirmation-result')).toHaveText('1 novos · 0 vinculados · 0 ignorados');
  }
  const section = page.getByRole('region', { name: 'Receitas previstas' }); const receipts = page.getByTestId('income-receipts-summary');
  await section.getByLabel('Descrição da receita prevista').fill('Salário avulso fictício'); await section.getByLabel('Valor esperado da receita em reais').fill('100,01');
  await section.getByLabel('Confirmo os dados desta previsão, sem registrar recebimento.').check(); await section.getByRole('button', { name: 'Cadastrar previsão', exact: true }).click();
  await expect(receipts).toContainText('Sem recebimento vinculado');
  await section.getByRole('combobox', { name: 'Conta bancária do recebimento', exact: true }).selectOption({ label: 'Banco dos recebimentos' });
  await section.getByRole('combobox', { name: 'Movimento bancário do recebimento', exact: true }).selectOption({ label: '2026-11-08 · Entrada CSV fictícia · BRL 150,00' });
  async function fillReceipt(magnitude: string, amount: string) {
    await section.getByLabel('Magnitude integral da entrada em reais').fill(magnitude); await section.getByLabel('Valor recebido a vincular em reais').fill(amount);
    await section.getByLabel('Confirmo que o movimento é entrada e o valor escolhido pertence a esta receita.').check();
  }
  await fillReceipt('150,00', '100,02'); await section.getByRole('button', { name: 'Vincular recebimento', exact: true }).click(); await expect(section.getByRole('status').filter({ hasText: 'O valor supera o pendente' })).toBeVisible();
  await fillReceipt('150,00', '33,34'); let originalKey = '';
  await page.route('**/api/incomes/*/settlements', async route => { if (route.request().method() === 'POST') { originalKey = route.request().headers()['idempotency-key']!; expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); } else await route.continue(); });
  await section.getByRole('button', { name: 'Vincular recebimento', exact: true }).click(); await expect(section.getByRole('button', { name: 'Recuperar resultado do recebimento' })).toBeVisible(); await expect(section.getByLabel('Valor recebido a vincular em reais')).toHaveValue('33,34');
  await expect(section.getByRole('button', { name: 'Salvar previsão', exact: true })).toBeDisabled(); await page.unroute('**/api/incomes/*/settlements');
  await page.route('**/api/incomes/*/settlements', async route => { if (route.request().method() === 'POST') expect(route.request().headers()['idempotency-key']).toBe(originalKey); await route.continue(); });
  await section.getByRole('button', { name: 'Recuperar resultado do recebimento' }).click(); await expect(receipts).toContainText('Parcialmente recebida'); await page.unroute('**/api/incomes/*/settlements');
  await expect(receipts).toContainText('Pendente: BRL 66,67'); await expect(receipts).toContainText('BRL -66,67'); await expect(page.getByTestId('income-source-summary')).toContainText('Reservado: BRL 33,34');
  await section.getByLabel('Valor esperado da receita em reais').fill('30,00'); await section.getByLabel('Confirmo os dados desta previsão, sem registrar recebimento.').check(); await section.getByRole('button', { name: 'Salvar previsão', exact: true }).click(); await expect(section.getByRole('status').filter({ hasText: 'Revise os recebimentos vinculados' })).toBeVisible();
  await section.getByRole('button', { name: 'Recarregar previsão', exact: true }).click(); await expect(section.getByLabel('Valor esperado da receita em reais')).toHaveValue('100,01');
  await section.getByRole('combobox', { name: 'Movimento bancário do recebimento', exact: true }).selectOption({ label: '2026-10-08 · Entrada OFX fictícia Compra 03/10 · BRL 66,67' });
  const item = (await (await page.request.get('/api/incomes')).json()).rows[0];
  expect((await page.request.patch(`/api/incomes/${item.id}`, { headers: { Origin: origin, 'Idempotency-Key': randomUUID() }, data: { expectedVersion: item.version, notes: 'Correção de outra sessão' } })).status()).toBe(200);
  await fillReceipt('66,67', '66,67'); await section.getByRole('button', { name: 'Vincular recebimento', exact: true }).click(); await expect(section.getByRole('status').filter({ hasText: 'A previsão mudou' })).toBeVisible(); await expect(section.getByLabel('Valor recebido a vincular em reais')).toHaveValue('66,67');
  await section.getByRole('button', { name: 'Atualizar receita e movimentos', exact: true }).click(); await expect(section.getByLabel('Notas da receita prevista')).toHaveValue('Correção de outra sessão');
  await fillReceipt('66,67', '66,67'); await section.getByRole('button', { name: 'Vincular recebimento', exact: true }).click(); await expect(receipts).toContainText('Recebida pelas alocações'); await expect(receipts).toContainText('Pendente: BRL 0,00');
  await expect(page.getByTestId('income-receipt-allocations').getByRole('listitem')).toHaveCount(2);
  await page.reload(); await section.getByRole('button', { name: 'Abrir previsão: Salário avulso fictício · Prevista', exact: true }).click(); await expect(receipts).toContainText('Recebido vinculado: BRL 100,01');
  await section.getByLabel('Confirmo o cancelamento definitivo desta previsão.').check(); await section.getByRole('button', { name: 'Cancelar previsão', exact: true }).click(); await expect(section.getByRole('status').filter({ hasText: 'Há recebimentos ativos' })).toBeVisible();
  await section.getByRole('button', { name: 'Revisar reversão de BRL 66,67', exact: true }).click(); await section.getByLabel('Confirmo reverter somente o vínculo selecionado, sem estornar o movimento bancário.').check();
  await page.route('**/api/incomes/*/settlements/*/reverse', async route => { expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); }, { times: 1 });
  await section.getByRole('button', { name: 'Confirmar reversão do recebimento', exact: true }).click(); await section.getByRole('button', { name: 'Recuperar resultado do recebimento' }).click(); await expect(receipts).toContainText('Parcialmente recebida');
  await expect(page.getByTestId('income-receipt-allocations')).toContainText('Revertida');
  await section.getByRole('button', { name: 'Consultar histórico da previsão', exact: true }).click(); await expect(section.getByRole('heading', { name: 'Histórico da previsão — últimas 20 alterações' })).toBeVisible();
  const account = (await (await page.request.get('/api/accounts')).json())[0]; expect((await (await page.request.get(`/api/entries?kind=bank&accountId=${account.id}`)).json()).total).toBe(2); expect((await (await page.request.get('/api/incomes')).json()).total).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 }); await section.getByRole('heading', { name: 'Recebimentos vinculados', exact: true }).scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: 'test-results/income-settlements-mobile.png' });
  await section.getByRole('combobox', { name: 'Conta bancária do recebimento', exact: true }).selectOption({ label: 'Banco dos recebimentos' }); await section.getByRole('combobox', { name: 'Movimento bancário do recebimento', exact: true }).selectOption({ label: '2026-10-08 · Entrada OFX fictícia Compra 03/10 · BRL 66,67' });
  await section.getByLabel('Magnitude integral da entrada em reais').focus(); await section.getByLabel('Magnitude integral da entrada em reais').press('Tab'); await expect(section.getByLabel('Valor recebido a vincular em reais')).toBeFocused(); await section.getByLabel('Magnitude integral da entrada em reais').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/income-settlements-editor-mobile.png' });
});
