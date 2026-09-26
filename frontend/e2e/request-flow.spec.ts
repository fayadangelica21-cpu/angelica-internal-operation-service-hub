import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    const token = route.request().headers().authorization?.replace('Bearer e2e-token:', '') || 'employee@example.test';
    const isStaff = token.includes('staff');
    const isAdmin = token.includes('admin');
    await route.fulfill({ json: { id: token, role: isAdmin ? 'Admin' : isStaff ? 'Staff' : 'Employee', ...(isStaff ? { departmentId: 'DEPT-IT' } : {}) } });
  });
  const staffQueue = [{
    id: 'REQ-IT-QUEUE-001',
    requesterId: 'employee-private-id',
    departmentId: 'DEPT-IT',
    description: 'IT request visible to the IT team',
    status: 'Open',
    ownerId: null as string | null,
  }];
  await page.route('**/requests/queue', async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer e2e-token:/);
    await route.fulfill({ json: staffQueue });
  });
  await page.route('**/requests/REQ-IT-QUEUE-001/assign', async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer e2e-token:/);
    const { ownerId } = route.request().postDataJSON() as { ownerId: string };
    expect(ownerId).toBe('e2e-it.staff@example.test');
    staffQueue[0].ownerId = ownerId;
    staffQueue[0].status = 'In Progress';
    await route.fulfill({ json: staffQueue[0] });
  });
  await page.route('**/requests/REQ-IT-QUEUE-001/status', async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer e2e-token:/);
    expect(route.request().postDataJSON()).toEqual({ targetStatus: 'Resolved' });
    const resolved = { ...staffQueue[0], status: 'Resolved' };
    staffQueue.splice(0, staffQueue.length);
    await route.fulfill({ json: resolved });
  });
  await page.route('**/requests', async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer e2e-token:/);
    const payload = route.request().postDataJSON() as { departmentId: string; description: string };
    const record = {
      id: 'REQ-E2E-001',
      requesterId: 'e2e-employee@example.test',
      departmentId: payload.departmentId,
      description: payload.description,
      status: 'Open',
    };
    await route.fulfill({
      status: 201,
      json: record,
    });
  });
});

test('employee can submit a request and see the persisted lifecycle starting state', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('employee@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const signOutButton = page.getByRole('button', { name: 'Sign out' });
  await expect(signOutButton).toBeVisible();
  const signOutOffsetFromPanelCenter = await signOutButton.evaluate((button) => {
    const panel = button.closest('.form-panel')!.getBoundingClientRect();
    return button.getBoundingClientRect().left - panel.left - panel.width / 2;
  });
  expect(signOutOffsetFromPanelCenter).toBeGreaterThan(0);
  await expect(page.getByText('e2e-employee@example.test', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'IT', exact: true }).click();
  await page.getByLabel('Description').fill('Laptop screen flickers');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('heading', { name: 'Request submitted' })).toBeVisible();
  await expect(page.getByLabel('Request status Open')).toBeVisible();
  await expect(page.getByLabel('Created request')).toContainText('Laptop screen flickers');
});

test('AI triage automatically selects the suggested department', async ({ page }) => {
  await page.route('**/triage', async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        draftId: 'triage-e2e-001',
        departmentId: 'DEPT-HR',
        issueType: 'hr_policy',
        suggestedNextStep: 'Contact the HR team.',
        confidence: 0.93,
        requiresMoreInfo: false,
        classification: 'clear',
        reasoning: 'The issue belongs to HR.',
      },
    });
  });

  await page.goto('/');
  await page.getByLabel('Email').fill('employee@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Description').fill('I need help understanding my leave balance');
  await page.getByRole('button', { name: 'Get AI suggestion' }).click();

  await expect(page.getByRole('button', { name: 'HR', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'IT', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('an employee can create an account, enter the workspace, and sign out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your employee account' })).toBeVisible();
  await page.getByLabel('Full name').fill('Demo Employee');
  await page.getByLabel('Email').fill('new.employee@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create employee account' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText('e2e-new.employee@example.test', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('login and employee signup require valid email and password fields', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByLabel('Email')).toHaveAttribute('required', '');
  await expect(page.getByLabel('Password')).toHaveAttribute('required', '');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByLabel('Full name')).toHaveAttribute('required', '');
  await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email');
  await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '6');
  const formIsValid = await page.locator('.auth-form').evaluate((form: HTMLFormElement) => form.checkValidity());
  expect(formIsValid).toBe(false);
  await page.getByLabel('Full name').fill('  ');
  await page.getByLabel('Email').fill('whitespace.name@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create employee account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a name with at least 2 non-space characters.');
});

test('Staff can take ownership of a request and resolve it from their department queue', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const staffQueue = [
    {
      id: 'REQ-IT-QUEUE-001',
      requesterId: 'employee-private-id',
      departmentId: 'DEPT-IT',
      description: 'IT request visible to the IT team',
      status: 'Open',
      ownerId: null as string | null,
    },
    {
      id: 'REQ-IT-QUEUE-002',
      requesterId: 'employee-private-id-2',
      departmentId: 'DEPT-IT',
      description: 'Another request stays visible during resolution',
      status: 'Open',
      ownerId: null as string | null,
    },
  ];
  await page.route('**/requests/queue', async (route) => route.fulfill({ json: staffQueue }));
  await page.route('**/requests/REQ-IT-QUEUE-001/assign', async (route) => {
    staffQueue[0].ownerId = 'e2e-it.staff@example.test';
    staffQueue[0].status = 'In Progress';
    await route.fulfill({ json: staffQueue[0] });
  });
  await page.route('**/requests/REQ-IT-QUEUE-001/status', async (route) => {
    const resolved = { ...staffQueue[0], status: 'Resolved' };
    staffQueue.splice(0, 1);
    await route.fulfill({ json: resolved });
  });

  await page.goto('/');
  await page.getByLabel('Email').fill('it.staff@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'IT request queue' })).toBeVisible();
  const resolvingRequest = page.getByRole('article').filter({ hasText: 'REQ-IT-QUEUE-001' });
  const otherRequest = page.getByRole('article').filter({ hasText: 'REQ-IT-QUEUE-002' });
  await expect(resolvingRequest).toContainText('IT request visible to the IT team');
  await expect(otherRequest).toBeVisible();
  await expect(page.getByText('employee-private-id', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit request' })).toHaveCount(0);

  await resolvingRequest.getByRole('button', { name: 'Take ownership' }).click();
  await expect(resolvingRequest).toContainText('In Progress');
  await resolvingRequest.getByRole('button', { name: 'Resolve request' }).click();
  await expect(resolvingRequest).toHaveClass(/queue-request-card--removing/);
  await expect.poll(async () => Number(await resolvingRequest.evaluate((card) => getComputedStyle(card).opacity))).toBeLessThan(0.5);
  expect(await resolvingRequest.evaluate((card) => getComputedStyle(card).transitionDuration)).toContain('0.3s');
  await expect(otherRequest).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(resolvingRequest).toHaveCount(0);
  await expect(otherRequest).toBeVisible();
});

test('taking ownership moves that request to the top of the department queue', async ({ page }) => {
  const queue = [
    {
      id: 'REQ-IT-NEWER',
      requesterId: 'employee-newer',
      departmentId: 'DEPT-IT',
      description: 'Newer request that remains open',
      status: 'Open',
      ownerId: null as string | null,
    },
    {
      id: 'REQ-IT-CLAIMED',
      requesterId: 'employee-older',
      departmentId: 'DEPT-IT',
      description: 'Older request Staff will claim',
      status: 'Open',
      ownerId: null as string | null,
    },
  ];
  await page.route('**/requests/queue', async (route) => route.fulfill({ json: queue }));
  await page.route('**/requests/REQ-IT-CLAIMED/assign', async (route) => {
    queue[1].status = 'In Progress';
    queue[1].ownerId = 'e2e-it.staff@example.test';
    queue.unshift(queue.pop()!);
    await route.fulfill({ json: queue[0] });
  });

  await page.goto('/');
  await page.getByLabel('Email').fill('it.staff@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const requestCards = page.getByRole('article');
  await expect(requestCards.nth(0)).toContainText('REQ-IT-NEWER');
  await expect(requestCards.nth(1)).toContainText('REQ-IT-CLAIMED');

  await requestCards.nth(1).getByRole('button', { name: 'Take ownership' }).click();
  await expect(requestCards.nth(0)).toContainText('REQ-IT-CLAIMED');
  await expect(requestCards.nth(0)).toContainText('In Progress');
});

test('Staff see a clear message if another staff member already took the request', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('it.staff@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Take ownership' })).toBeVisible();

  await page.route('**/requests/REQ-IT-QUEUE-001/assign', async (route) => {
    await route.fulfill({ status: 409, json: { message: 'This request was already taken. Refresh the department queue.' } });
  });
  await page.getByRole('button', { name: 'Take ownership' }).click();
  await expect(page.getByRole('alert')).toHaveText('This request was already taken. Refresh the department queue.');
  await page.route('**/requests/queue', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ json: [{
      id: 'REQ-IT-QUEUE-001',
      requesterId: 'employee-private-id',
      departmentId: 'DEPT-IT',
      description: 'IT request visible to the IT team',
      status: 'In Progress',
      ownerId: 'another-staff',
    }] });
  });
  await page.getByRole('button', { name: 'Refresh queue' }).click();
  await expect(page.getByRole('button', { name: /Refreshing queue/ })).toBeDisabled();
  await expect(page.getByRole('article')).toContainText('Open');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByText('In Progress', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resolve request' })).toBeVisible();
});

test('admin authentication resolves the admin role without showing employee submission', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Admin workspace' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit request' })).toHaveCount(0);
});

test('a delayed profile response from an older account cannot replace the current login', async ({ page }) => {
  let releaseOldProfile: (() => void) | undefined;
  let oldProfileStarted: (() => void) | undefined;
  const oldStarted = new Promise<void>((resolve) => { oldProfileStarted = resolve; });
  await page.route('**/auth/me', async (route) => {
    const token = route.request().headers().authorization ?? '';
    if (token.includes('old-user')) {
      oldProfileStarted?.();
      await new Promise<void>((resolve) => { releaseOldProfile = resolve; });
      await route.fulfill({ json: { id: 'old-user', role: 'Employee' } });
      return;
    }
    await route.fulfill({ json: { id: 'current-user', role: 'Admin' } });
  });

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('service-hub-e2e-user', JSON.stringify({ uid: 'old-user', email: 'old@example.test' }));
    window.dispatchEvent(new Event('service-hub-auth-changed'));
  });
  await oldStarted;
  await page.evaluate(() => {
    localStorage.setItem('service-hub-e2e-user', JSON.stringify({ uid: 'current-user', email: 'current@example.test' }));
    window.dispatchEvent(new Event('service-hub-auth-changed'));
  });
  await expect(page.getByRole('heading', { name: 'Admin workspace' })).toBeVisible();
  releaseOldProfile?.();
  await expect(page.getByRole('heading', { name: 'Admin workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Employee workspace' })).toHaveCount(0);
});

test('a signed-in user can sign out when the backend cannot load the account profile', async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({ status: 503, json: { message: 'Backend profile unavailable.' } });
  });
  await page.goto('/');
  await page.getByLabel('Email').fill('employee@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Backend profile unavailable.');
  await page.getByRole('button', { name: 'Sign out and retry' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
