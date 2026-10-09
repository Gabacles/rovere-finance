import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mailLink } from '../../scripts/test-mail.mjs';

test('confirm and reimport 500 CSV and OFX charges, recovering a lost response', async ({ page }) => {
  test.setTimeout(120000);
  const email = `confirmation-${randomUUID()}@rovere.test`; const password = 'Fictitious-browser-123!';
  expect((await page.request.post('/api/auth/sign-up/email', { headers: { Origin: 'http://127.0.0.1:15173' }, data: { name: 'Pessoa fictícia', email, password } })).status()).toBe(200);
  await page.goto(await mailLink(email, 'Confirme')); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Nome da conta de crédito').fill('Crédito fictício'); await page.getByRole('button', { name: 'Adicionar conta de crédito', exact: true }).click();
  await page.getByLabel('Competência da fatura').fill('2026-10'); await page.getByRole('button', { name: 'Confirmar competência', exact: true }).click();
  const csv = 'Data;Descrição;Valor;ID\n' + Array.from({ length: 500 }, (_, i) => `08/10/2026;CSV fictício ${i};-12,34;csv-${i}`).join('\n');
  const template = await readFile('packages/importers/test/fixtures/card-220.ofx', 'utf8'); const first = template.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/)![0];
  const ofx = template.replace(/<STMTTRN>[\s\S]*<\/STMTTRN>/, Array.from({ length: 500 }, (_, i) => first.replace(/<FITID>[^<]+<\/FITID>/, `<FITID>ofx-${i}</FITID>`).replace('Loja &amp; Café fictícios', `OFX fictício ${i}`)).join(''));
  await page.getByRole('combobox', { name: 'Natureza do CSV', exact: true }).selectOption('card');
  await page.getByText('Colunas opcionais', { exact: true }).click(); await page.getByLabel('Identificador externo', { exact: true }).fill('ID');
  await page.getByLabel('Conferi o mapeamento, a moeda BRL e os formatos acima.').check();
  // The server commits but the browser loses the first confirmation response.
  await page.route('**/api/imports/*/confirm', async route => { expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); }, { times: 1 });
  for (const [format, contents, newTotal] of [['csv', csv, 500], ['ofx', ofx, 1000]] as const) {
    await page.getByRole('combobox', { name: 'Formato do arquivo', exact: true }).selectOption(format);
    for (const reimport of [false, true]) {
      await page.getByLabel('Arquivo para revisão').setInputFiles({ name: `confirmation.${format}`, mimeType: 'application/octet-stream', buffer: Buffer.from(contents) });
      await page.getByRole('button', { name: 'Enviar para revisão', exact: true }).click();
      await expect(page.getByTestId('import-status')).toContainText('Em revisão');
      await page.getByRole('combobox', { name: 'Crédito para este bloco', exact: true }).selectOption({ label: 'Crédito fictício' });
      await page.getByRole('combobox', { name: 'Competência para este bloco', exact: true }).selectOption({ label: '2026-10' });
      await page.getByRole('button', { name: 'Salvar destino do bloco 1', exact: true }).click();
      await expect(page.getByTestId('confirmation-preview')).toHaveText(reimport ? '0 novos · 500 vinculados · 0 ignorados' : '500 novos · 0 vinculados · 0 ignorados', { timeout: 20000 });
      await page.getByRole('button', { name: 'Confirmar registros selecionados', exact: true }).click();
      await expect(page.getByTestId('confirmation-result')).toHaveText(reimport ? '0 novos · 500 vinculados · 0 ignorados' : '500 novos · 0 vinculados · 0 ignorados', { timeout: 30000 });
      await page.getByRole('button', { name: 'Consultar registros do bloco 1', exact: true }).click(); await expect(page.getByTestId('entry-total')).toContainText(`${newTotal} registros`);
    }
  }
  await page.reload(); await page.getByRole('button', { name: 'confirmation.ofx — Confirmada', exact: true }).first().click();
  await expect(page.getByTestId('confirmation-result')).toContainText('500 vinculados');
  await page.getByRole('button', { name: 'Consultar registros do bloco 1', exact: true }).click(); await expect(page.getByTestId('entry-total')).toContainText('1000 registros');
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('heading', { name: 'Resultado da importação', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/confirmation-mobile.png' });
  await page.getByRole('button', { name: 'Remover somente arquivo original', exact: true }).click(); await expect(page.getByRole('link', { name: 'Baixar arquivo original', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('confirmation-result')).toContainText('500 vinculados');
});

test('resolve a possible duplicate explicitly by keeping both or linking', async ({ page }) => {
  const email = `duplicate-${randomUUID()}@rovere.test`; const password = 'Fictitious-browser-123!';
  expect((await page.request.post('/api/auth/sign-up/email', { headers: { Origin: 'http://127.0.0.1:15173' }, data: { name: 'Pessoa fictícia', email, password } })).status()).toBe(200);
  await page.goto(await mailLink(email, 'Confirme')); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Nome da conta', { exact: true }).fill('Banco fictício'); await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click();
  const contents = 'Data;Descrição;Valor\n08/10/2026;Compra legítima idêntica;-10,00';
  for (const decision of ['new', 'distinct', 'link']) {
    await page.getByLabel('Arquivo para revisão').setInputFiles({ name: 'identical.csv', mimeType: 'text/csv', buffer: Buffer.from(contents) });
    await page.getByLabel('Conferi o mapeamento, a moeda BRL e os formatos acima.').check(); await page.getByRole('button', { name: 'Enviar para revisão', exact: true }).click();
    await expect(page.getByTestId('import-status')).toContainText('Em revisão'); await page.getByRole('combobox', { name: 'Conta para este bloco', exact: true }).selectOption({ label: 'Banco fictício' }); await page.getByRole('button', { name: 'Salvar destino do bloco 1', exact: true }).click();
    if (decision !== 'new') {
      await expect(page.getByRole('button', { name: 'Confirmar registros selecionados', exact: true })).toBeDisabled();
      if (decision === 'distinct') await page.getByRole('button', { name: 'Manter ambas nas sugestões da seleção', exact: true }).click();
      else {
        const dropdown = page.getByRole('combobox', { name: 'Decisão da linha 1', exact: true });
        const option = await dropdown.locator(`option[value^="${decision}:"]`).first().getAttribute('value'); await dropdown.selectOption(option!);
      }
    }
    await expect(page.getByTestId('confirmation-preview')).toHaveText(decision === 'link' ? '0 novos · 1 vinculados · 0 ignorados' : '1 novos · 0 vinculados · 0 ignorados');
    await page.getByRole('button', { name: 'Confirmar registros selecionados', exact: true }).click(); await expect(page.getByTestId('import-status')).toContainText('Confirmada');
  }
  await page.getByRole('button', { name: 'Consultar registros do bloco 1', exact: true }).click(); await expect(page.getByTestId('entry-total')).toContainText('2 registros');
});
