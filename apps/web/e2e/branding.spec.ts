import { expect, test, type Page } from '@playwright/test';

const routes = [
  '/school',
  '/academic-years',
  '/organization',
  '/grade-levels',
  '/classes',
  '/pedagogy',
  '/timetable',
  '/attendance',
  '/assessments',
  '/report-cards',
  '/student-life',
  '/staff',
  '/communications',
  '/services',
  '/portal',
  '/settings',
  '/students',
  '/students/new',
  '/guardian-requests',
  '/students/import',
  '/students/reenroll',
  '/fees',
  '/payments',
  '/mobile-money',
  '/procurement',
  '/external-payments',
  '/notifications-admin',
  '/accounting',
  '/reports/class-status',
  '/reports/advanced',
  '/direction',
  '/exports',
  '/audit',
  '/cashier',
  '/users',
  '/roles',
  '/profile',
] as const;

async function openDemoSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cplan.access-token', 'csbnk-demo-access');
    localStorage.setItem('cplan.refresh-token', 'csbnk-demo-refresh');
  });
}

test('identité CSB sur toutes les routes principales @desktop', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(
        `${page.url()} :: ${message.text()} :: ${message.location().url || 'source inconnue'}`,
      );
    }
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await openDemoSession(page);

  for (const route of routes) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}$`));
    await expect(page).toHaveTitle('CSB Noutcha KAMGUE');
    await expect(page.getByText('CSB Noutcha KAMGUE', { exact: true }).first()).toBeVisible();
    const main = page.locator('main.app-content');
    await expect(main).toBeVisible();
    await expect.poll(async () => (await main.innerText()).trim().length).toBeGreaterThan(10);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(page.locator('img[src*="school-fees-app"]')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/School Fees App/i);
  }

  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe(
    '/brand/csb-nk-logo.png',
  );
  await page.goto('/');
  await expect(page.locator('.brand-lockup img')).toHaveAttribute('src', '/brand/csb-nk-logo.png');
  await expect(page.locator('.app-sidebar')).toHaveCSS('background-color', 'rgb(11, 27, 61)');
  const screenshot = testInfo.outputPath('branding-settings.png');
  await page.goto('/settings');
  const settingsMain = page.locator('main.app-content');
  await expect(settingsMain).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();
  await settingsMain.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: screenshot, fullPage: false });
  expect(runtimeErrors).toEqual([]);
});

test('blason et charte officielle sur la connexion @desktop', async ({ page }, testInfo) => {
  await page.goto('/login');

  await expect(page.locator('.auth-brand img')).toHaveAttribute('src', '/brand/csb-nk-logo.png');
  await expect(page.locator('.auth-story')).toHaveCSS('background-color', 'rgb(11, 27, 61)');
  await expect(page.getByText('Apprendre · Persévérer · Réussir')).toBeVisible();
  await expect(page.locator('img[src*="school-fees-app"]')).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath('connexion-charte-officielle.png') });
});
