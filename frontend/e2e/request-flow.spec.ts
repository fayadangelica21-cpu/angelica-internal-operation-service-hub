import { test, expect } from '@playwright/test';

test('employee can submit a request and see the persisted lifecycle starting state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'IT', exact: true }).click();
  await page.getByLabel('Description').fill('Laptop screen flickers');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('heading', { name: 'Request submitted' })).toBeVisible();
  await expect(page.getByLabel('Request status Open')).toBeVisible();
  await expect(page.getByLabel('Created request')).toContainText('Laptop screen flickers');
});
