import { expect, test, type Page } from '@playwright/test';

const password = 'CSBNoutchaDemo2026!';
const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? '5173'}`;

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail ou téléphone').fill(identifier);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('chaque profil rejoint automatiquement son espace métier @desktop', async ({ browser }) => {
  const profiles = [
    ['admin@csb-noutcha-kamgue.local', '/school'],
    ['direction@csb-noutcha-kamgue.local', '/direction'],
    ['compta@csb-noutcha-kamgue.local', '/accounting'],
    ['caisse@csb-noutcha-kamgue.local', '/cashier'],
    ['scolarite@csb-noutcha-kamgue.local', '/school'],
    ['enseignant@csb-noutcha-kamgue.local', '/portal'],
  ] as const;

  for (const [identifier, route] of profiles) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await login(page, identifier);
    await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/')}$`));
    await expect(page.locator('main.app-content')).toBeVisible();
    await context.close();
  }
});

test('le cockpit Super administrateur présente les indicateurs de pilotage @desktop', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 1100 });
  await login(page, 'superadmin@csb-noutcha-kamgue.local');

  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole('heading', { name: 'Pilotage du complexe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Les quatre cycles' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Situation financière globale' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qualité des données' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Services opérationnels' })).toBeVisible();
  for (const unit of ['Crèche', 'Maternelle', 'Primaire', 'Secondaire']) {
    await expect(page.getByRole('cell', { name: unit, exact: true })).toBeVisible();
  }
  await expect(page.getByText('CSB Noutcha KAMGUE', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pilotage du complexe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Élèves', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('platform-dashboard.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('le cockpit Super administrateur reste exploitable sur mobile @mobile', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await login(page, 'superadmin@csb-noutcha-kamgue.local');

  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole('heading', { name: 'Pilotage du complexe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Les quatre cycles' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'À traiter aujourd’hui' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qualité des données' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  await page.screenshot({
    path: testInfo.outputPath('platform-dashboard-mobile.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
