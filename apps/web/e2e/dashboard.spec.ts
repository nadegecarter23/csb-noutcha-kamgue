import { expect, test, type Page } from '@playwright/test';

async function openDemoSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cplan.access-token', 'csbnk-demo-access');
    localStorage.setItem('cplan.refresh-token', 'csbnk-demo-refresh');
  });
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('tableau de bord, périmètre et recherche @desktop', async ({ page }, testInfo) => {
  const errors = collectRuntimeErrors(page);
  await openDemoSession(page);
  await page.goto('/school');

  await expect(page).toHaveTitle('CSB Noutcha KAMGUE');
  await expect(page.getByText('CSB Noutcha KAMGUE', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Périmètre actif')).toHaveValue('0');
  await expect(page.getByLabel('Périmètre actif')).toContainText('Tout l’établissement');

  await page.getByRole('button', { name: /Rechercher un élève/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Recherche globale' });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/Rechercher un élève/).fill('Nathan');
  const firstStudent = dialog.getByRole('button', { name: 'Nathan Fotso SFA-00001' });
  await expect(firstStudent).toBeVisible();
  const desktopScreenshot = testInfo.outputPath('dashboard-desktop.png');
  await page.screenshot({ path: desktopScreenshot, fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('navigation responsive @mobile', async ({ page }, testInfo) => {
  const errors = collectRuntimeErrors(page);
  await openDemoSession(page);
  await page.goto('/school');

  await expect(page.getByLabel('Périmètre actif')).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.getByText('CSB Noutcha KAMGUE', { exact: true }).first()).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect.poll(async () => (await navigation.boundingBox())?.x).toBe(0);
  const mobileScreenshot = testInfo.outputPath('mobile-menu.png');
  await page.screenshot({ path: mobileScreenshot, fullPage: false });
  await navigation.getByRole('link', { name: 'Élèves', exact: true }).click();
  await expect(page).toHaveURL(/\/students$/);
  await expect(page.getByRole('heading', { name: /Élèves/ }).first()).toBeVisible();
  await expect(page.getByLabel('Fermer le menu')).toBeHidden();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(errors).toEqual([]);
});

test('navigation responsive @tablet', async ({ page }, testInfo) => {
  const errors = collectRuntimeErrors(page);
  await openDemoSession(page);
  await page.goto('/school');

  await expect(page).toHaveTitle('CSB Noutcha KAMGUE');
  await expect(page.getByLabel('Périmètre actif')).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect.poll(async () => (await navigation.boundingBox())?.x).toBe(0);
  const tabletScreenshot = testInfo.outputPath('tablet-menu.png');
  await page.screenshot({ path: tabletScreenshot, fullPage: false });
  await navigation.getByRole('link', { name: 'Élèves', exact: true }).click();

  await expect(page).toHaveURL(/\/students$/);
  await expect(page.getByRole('heading', { name: /Élèves/ }).first()).toBeVisible();
  await expect(page.getByLabel('Fermer le menu')).toBeHidden();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(errors).toEqual([]);
});
