import { test, expect } from '@playwright/test';

test('employee can submit a request and see the persisted lifecycle starting state', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Department').selectOption('DEPT-IT');
  await page.getByLabel('Description').fill('Laptop screen flickers');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('heading', { name: 'Request submitted' })).toBeVisible();
  await expect(page.getByLabel('Request status')).toContainText('Open');
  await expect(
    page.getByRole('region', { name: 'Created request' }).getByText('Laptop screen flickers'),
  ).toBeVisible();
});
