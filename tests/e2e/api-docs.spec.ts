import { test, expect } from './fixtures';
import { randomUUID } from 'node:crypto';
import { mailLink } from '../../scripts/test-mail.mjs';

test('Swagger reads the real spec and uses the same session/origin for protected reads and writes', async ({ page }) => {
  const email = `swagger-${randomUUID()}@rovere.test`; const password = 'Fictitious-swagger-123!';
  const failures: string[] = []; page.on('pageerror', error => failures.push(error.message));
  await page.goto('/api/docs');
  await expect(page.getByRole('heading', { name: 'Rovere Finance — API' })).toBeVisible();
  await page.locator('h3[data-tag="Identidade"]').click();
  await expect(page.locator('#operations-Identidade-IdentityController_me')).toBeAttached();
  const me = page.locator('#operations-Identidade-IdentityController_me');
  await me.locator('.opblock-summary').click(); await me.getByRole('button', { name: 'Try it out' }).click();
  await me.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(me.locator('.live-responses-table .response-col_status').last()).toHaveText('401');
  // Authentication uses the product's supported email-verification flow.
  await page.goto('/'); await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Seu nome').fill('Pessoa fictícia Swagger'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Confira seu email');
  await page.goto(await mailLink(email, 'Confirme')); await expect(page.getByRole('status')).toContainText('Email confirmado');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Suas contas' })).toBeVisible();
  await page.goto('/api/docs');
  await page.locator('h3[data-tag="Identidade"]').click();
  await me.locator('.opblock-summary').click(); await me.getByRole('button', { name: 'Try it out' }).click(); await me.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(me.locator('.live-responses-table .response-col_status').last()).toHaveText('200');
  await expect(me.locator('.live-responses-table')).toContainText(email);
  await page.locator('h3[data-tag="Contas bancárias"]').click();
  const account = page.locator('#operations-Contas_bancárias-AccountsController_create');
  await account.locator('.opblock-summary').click(); await account.getByRole('button', { name: 'Try it out' }).click();
  await account.locator('textarea').fill(JSON.stringify({ name: 'Conta fictícia Swagger' }));
  await account.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(account.locator('.live-responses-table .response-col_status').last()).toHaveText('201');
  await expect(account.locator('.live-responses-table')).toContainText('Conta fictícia Swagger');
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-results/swagger-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(failures).toEqual([]);
  await page.goto('/'); await expect(page.getByRole('listitem')).toContainText('Conta fictícia Swagger');
});
