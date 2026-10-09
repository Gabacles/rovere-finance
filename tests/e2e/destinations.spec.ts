import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mailLink } from '../../scripts/test-mail.mjs';

test('create and select bank, shared cards and explicitly confirmed invoice destinations', async ({ page }) => {
  const email = `destinations-${randomUUID()}@rovere.test`; const password = 'Fictitious-browser-123!';
  const signup = await page.request.post('/api/auth/sign-up/email', { headers: { Origin: 'http://127.0.0.1:15173' }, data: { name: 'Pessoa fictícia', email, password } });
  expect(signup.status()).toBe(200);
  await page.goto(await mailLink(email, 'Confirme'));
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Nome da conta', { exact: true }).fill('Banco fictício');
  await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click();
  await page.getByRole('combobox', { name: 'Conta de destino', exact: true }).selectOption({ label: 'Banco fictício' });
  await expect(page.getByTestId('destination-summary')).toContainText('Banco fictício');
  await page.getByLabel('Nome da conta de crédito').fill('Crédito compartilhado');
  await page.getByRole('button', { name: 'Adicionar conta de crédito', exact: true }).click();
  await page.getByRole('combobox', { name: 'Tipo de destino', exact: true }).selectOption('card');
  await expect(page.getByTestId('destination-summary')).toContainText('Informe uma conta de crédito e a competência');
  for (const [name, kind] of [['Cartão físico', 'physical'], ['Cartão virtual', 'virtual'], ['Cartão adicional', 'additional']]) {
    await page.getByLabel('Nome do cartão').fill(name!);
    await page.getByRole('combobox', { name: 'Tipo do cartão', exact: true }).selectOption(kind!);
    await page.getByRole('button', { name: 'Adicionar cartão', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Cartão de destino (opcional)', exact: true }).locator('option:checked')).toHaveText(name!);
  }
  await page.getByLabel('Competência da fatura').fill('2026-10');
  await page.getByRole('button', { name: 'Confirmar competência', exact: true }).click();
  await expect(page.getByTestId('destination-summary')).toContainText('competência 2026-10');
  await page.getByRole('combobox', { name: 'Cartão de destino (opcional)', exact: true }).selectOption({ label: 'Cartão virtual' });
  await expect(page.getByTestId('destination-summary')).toContainText('Cartão virtual');
  await page.reload();
  await page.getByRole('combobox', { name: 'Conta de crédito', exact: true }).selectOption({ label: 'Crédito compartilhado' });
  await page.getByRole('combobox', { name: 'Tipo de destino', exact: true }).selectOption('card');
  await page.getByRole('combobox', { name: 'Período de destino', exact: true }).selectOption({ label: '2026-10' });
  await page.getByRole('combobox', { name: 'Cartão de destino (opcional)', exact: true }).selectOption({ label: 'Cartão adicional' });
  await expect(page.getByTestId('destination-summary')).toContainText('Cartão adicional');
  const sharedId = await page.getByRole('combobox', { name: 'Conta de crédito', exact: true }).inputValue();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/destinations-mobile.png', fullPage: true });
  await page.getByLabel('Nome da conta de crédito').fill('Outro crédito');
  await page.getByRole('button', { name: 'Adicionar conta de crédito', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Cartão de destino (opcional)', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Período de destino', exact: true })).toHaveValue('');
  await expect(page.getByTestId('destination-summary')).toContainText('Informe uma conta de crédito e a competência');
  // A delayed response cannot restore children from a previously selected account.
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/credit-accounts/${sharedId}/cards`, async route => {
    const response = await route.fetch(); await delayed; await route.fulfill({ response });
  });
  await Promise.all([
    page.waitForRequest(`**/api/credit-accounts/${sharedId}/cards`),
    page.getByRole('combobox', { name: 'Conta de crédito', exact: true }).selectOption(sharedId),
  ]);
  await page.getByRole('combobox', { name: 'Conta de crédito', exact: true }).selectOption('');
  await expect(page.getByRole('button', { name: 'Adicionar conta de crédito', exact: true })).toBeEnabled();
  const responseReceived = page.waitForResponse(`**/api/credit-accounts/${sharedId}/cards`);
  release(); await responseReceived;
  await expect(page.getByRole('combobox', { name: 'Cartão de destino (opcional)', exact: true }).locator('option')).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Período de destino', exact: true }).locator('option')).toHaveCount(1);
});
