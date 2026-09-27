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
  const employeeRequests: {
    id: string;
    requesterId: string;
    departmentId: string;
    description: string;
      status: string;
      ownerId: null;
      createdAt: string;
      statusHistory: { historyId: string; fromStatus: string | null; toStatus: string; changedAt: string }[];
  }[] = [];
  await page.route('**/requests', async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer e2e-token:/);
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: employeeRequests });
      return;
    }
    const payload = route.request().postDataJSON() as { departmentId: string; description: string };
    const record = {
      id: `REQ-E2E-${employeeRequests.length + 1}`,
      requesterId: 'e2e-employee@example.test',
      departmentId: payload.departmentId,
      description: payload.description,
      status: 'Open',
      ownerId: null,
      createdAt: new Date().toISOString(),
      statusHistory: [{ historyId: `HIST-${employeeRequests.length + 1}-OPEN`, fromStatus: null, toStatus: 'Open', changedAt: new Date().toISOString() }],
    };
    employeeRequests.unshift(record);
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
  const submissionDialog = page.getByRole('dialog', { name: 'Request submitted' });
  await expect(submissionDialog).toBeVisible();
  await expect(submissionDialog).toContainText('REQ-E2E-1');
  await expect(submissionDialog).toContainText('Open the My requests tab to see its status and updates.');
  await expect(page.getByLabel('Created request')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'New request' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Your requests' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue submitting' }).click();

  await page.getByRole('button', { name: 'HR', exact: true }).click();
  await page.getByLabel('Description').fill('Need help understanding my leave balance');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('dialog', { name: 'Request submitted' })).toContainText('REQ-E2E-2');
  await page.getByRole('button', { name: 'Go to My requests' }).click();
  await expect(page.getByLabel('Description')).toHaveCount(0);
  const requestHistory = page.getByRole('region', { name: 'Your requests' });
  await expect(requestHistory).toBeVisible();
  await expect(requestHistory.locator('.request-history-card')).toHaveCount(2);
  await expect(requestHistory).toContainText('Need help understanding my leave balance');
  await expect(requestHistory).toContainText('Laptop screen flickers');

  await page.route('**/requests', async (route) => {
    await route.fulfill({ json: [
      {
        id: 'REQ-E2E-2', requesterId: 'e2e-employee@example.test', departmentId: 'DEPT-HR',
        description: 'Need help understanding my leave balance', status: 'In Progress', createdAt: new Date().toISOString(),
        statusHistory: [
          { historyId: 'REQ-E2E-2-OPEN', fromStatus: null, toStatus: 'Open', changedAt: new Date(Date.now() - 3000).toISOString() },
          { historyId: 'REQ-E2E-2-PROGRESS', fromStatus: 'Open', toStatus: 'In Progress', changedAt: new Date(Date.now() - 1000).toISOString() },
        ],
      },
      {
        id: 'REQ-E2E-1', requesterId: 'e2e-employee@example.test', departmentId: 'DEPT-IT',
        description: 'Laptop screen flickers', status: 'Resolved', createdAt: new Date(Date.now() - 1000).toISOString(),
        statusHistory: [
          { historyId: 'REQ-E2E-1-OPEN', fromStatus: null, toStatus: 'Open', changedAt: new Date(Date.now() - 5000).toISOString() },
          { historyId: 'REQ-E2E-1-PROGRESS', fromStatus: 'Open', toStatus: 'In Progress', changedAt: new Date(Date.now() - 3000).toISOString() },
          { historyId: 'REQ-E2E-1-RESOLVED', fromStatus: 'In Progress', toStatus: 'Resolved', changedAt: new Date(Date.now() - 1000).toISOString() },
        ],
      },
    ] });
  });
  await page.getByRole('button', { name: 'Refresh requests' }).click();
  await expect(requestHistory.locator('.request-history-card').nth(0)).toContainText('In Progress');
  await expect(requestHistory.locator('.request-history-card').nth(1)).toContainText('Resolved');
  const resolvedTimeline = requestHistory.getByRole('list', { name: 'Status history for request REQ-E2E-1' });
  await expect(resolvedTimeline).toContainText('Submitted as Open');
  await expect(resolvedTimeline).toContainText('Open → In Progress');
  await expect(resolvedTimeline).toContainText('In Progress → Resolved');
  await expect(requestHistory.getByRole('list', { name: 'Status history for request REQ-E2E-2' })).toContainText('Open → In Progress');
  await page.getByRole('tab', { name: 'New request' }).click();
  await expect(page.getByLabel('Description')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your requests' })).toHaveCount(0);
});

test('Employee workspace shows only the authenticated employee history and no privileged views', async ({ page }) => {
  await page.route('**/requests', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers().authorization).toBe('Bearer e2e-token:e2e-employee@example.test');
    await route.fulfill({ json: [{
      id: 'REQ-PRIVACY-OWN',
      requesterId: 'e2e-employee@example.test',
      departmentId: 'DEPT-IT',
      description: 'My private request',
      status: 'Open',
      ownerId: null,
      createdAt: new Date().toISOString(),
      statusHistory: [{ historyId: 'HIST-PRIVACY-OWN', fromStatus: null, toStatus: 'Open', changedAt: new Date().toISOString() }],
    }] });
  });

  await page.goto('/');
  await page.getByLabel('Email').fill('employee@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('tab', { name: 'My requests' }).click();

  const requestHistory = page.getByRole('region', { name: 'Your requests' });
  await expect(requestHistory).toContainText('My private request');
  await expect(requestHistory).not.toContainText('Another employee private request');
  await expect(page.getByRole('region', { name: 'Department request queue' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'All requests across departments' })).toHaveCount(0);
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
  await page.route('**/requests/admin', async (route) => route.fulfill({ json: [] }));
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
  expect(await resolvingRequest.evaluate((card) => getComputedStyle(card).transitionDuration)).toContain('0.3s');
  await expect.poll(async () => Number(await resolvingRequest.evaluate((card) => getComputedStyle(card).opacity))).toBeLessThan(0.5);
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

test('Admin can assign, reassign, and move a request to another department', async ({ page }) => {
  const targetRequest = {
    id: 'REQ-ADMIN-FR6-001',
    requesterId: 'employee-private-id',
    departmentId: 'DEPT-HR',
    description: 'HR request that needs an owner',
    status: 'Open',
    ownerId: null as string | null,
  };
  const staffMembers = [
    { id: 'staff-hr-one', displayName: 'HR One', email: 'hr.one@example.test' },
    { id: 'staff-hr-two', displayName: 'HR Two', email: 'hr.two@example.test' },
  ];
  await page.route('**/requests/REQ-ADMIN-FR6-001', async (route) => route.fulfill({ json: targetRequest }));
  await page.route('**/requests/admin', async (route) => route.fulfill({ json: [{
    ...targetRequest,
    ownerDisplayName: targetRequest.ownerId ? (targetRequest.ownerId === 'staff-hr-one' ? 'HR One' : 'HR Two') : null,
  }] }));
  await page.route('**/requests/REQ-ADMIN-FR6-001/assignees', async (route) => route.fulfill({ json: targetRequest.departmentId === 'DEPT-HR' ? staffMembers : [
    { id: 'staff-it-one', displayName: 'IT One', email: 'it.one@example.test' },
  ] }));
  await page.route('**/requests/REQ-ADMIN-FR6-001/assign', async (route) => {
    const { ownerId } = route.request().postDataJSON() as { ownerId: string };
    targetRequest.ownerId = ownerId;
    targetRequest.status = 'In Progress';
    await route.fulfill({ json: targetRequest });
  });
  await page.route('**/requests/REQ-ADMIN-FR6-001/department', async (route) => {
    const { departmentId } = route.request().postDataJSON() as { departmentId: string };
    targetRequest.departmentId = departmentId;
    targetRequest.ownerId = null;
    targetRequest.status = 'Open';
    await route.fulfill({ json: targetRequest });
  });

  await page.goto('/');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'All requests' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit request' })).toHaveCount(0);

  const monitor = page.getByRole('region', { name: 'All requests across departments' });
  await page.getByRole('button', { name: 'Manage assignment' }).click();
  await expect(monitor).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Manage request' })).toBeVisible();
  const selectedRequest = page.getByRole('region', { name: 'Request selected for assignment' });
  await expect(selectedRequest).toContainText('HR request that needs an owner');
  await expect(page.getByLabel('Assign to Staff')).toContainText('HR One');
  await expect(page.getByLabel('Assign to Staff')).not.toContainText('IT Staff');

  await page.getByLabel('Assign to Staff').selectOption('staff-hr-one');
  await page.getByRole('button', { name: 'Assign request' }).click();
  await expect(page.getByRole('status')).toHaveText('Request assigned successfully.');
  await expect(selectedRequest).toContainText('In Progress');
  await expect(selectedRequest).toContainText('HR One');

  await page.getByLabel('Assign to Staff').selectOption('staff-hr-two');
  await page.getByRole('button', { name: 'Reassign request' }).click();
  await expect(page.getByRole('status')).toHaveText('Request reassigned successfully.');
  await expect(selectedRequest).toContainText('HR Two');

  await page.getByRole('button', { name: 'Back to requests' }).click();
  await expect(monitor).toBeVisible();
  await expect(selectedRequest).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);

  await page.getByRole('button', { name: 'Manage assignment' }).click();
  await expect(selectedRequest).toBeVisible();
  await page.getByLabel('Move to another department').selectOption('DEPT-IT');
  await page.getByRole('button', { name: 'Move department' }).click();
  await expect(page.getByRole('status')).toHaveText('Request moved to IT and returned to the Open queue.');
  await expect(selectedRequest).toContainText('DepartmentIT');
  await expect(selectedRequest).toContainText('Current ownerUnassigned');
  await expect(selectedRequest).toContainText('Open');
  await expect(page.getByLabel('Assign to Staff')).toContainText('IT One');
  await page.getByRole('button', { name: 'Back to requests' }).click();
  await expect(monitor).toContainText('Unassigned');
  await expect(monitor.getByRole('article')).toContainText('IT');
});

test('Admin can monitor requests from all departments and refresh the list', async ({ page }) => {
  const requests = [
    { id: 'REQ-ADMIN-LIST-IT', departmentId: 'DEPT-IT', description: 'IT request for monitoring', status: 'Open', ownerId: null, ownerDisplayName: null },
    { id: 'REQ-ADMIN-LIST-HR', departmentId: 'DEPT-HR', description: 'HR request for monitoring', status: 'In Progress', ownerId: 'staff-hr-one', ownerDisplayName: 'HR One' },
    { id: 'REQ-ADMIN-LIST-FINANCE', departmentId: 'DEPT-FINANCE', description: 'Finance request for monitoring', status: 'Resolved', ownerId: null, ownerDisplayName: null },
  ];
  let listCalls = 0;
  await page.route('**/requests/admin', async (route) => {
    listCalls += 1;
    await route.fulfill({ json: requests });
  });
  await page.route('**/requests/REQ-ADMIN-LIST-HR', async (route) => route.fulfill({ json: requests[1] }));
  await page.route('**/requests/REQ-ADMIN-LIST-HR/assignees', async (route) => route.fulfill({ json: [
    { id: 'staff-hr-one', displayName: 'HR One', email: 'hr.one@example.test' },
  ] }));

  await page.goto('/');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'All requests' })).toBeVisible();
  const monitor = page.getByRole('region', { name: 'All requests across departments' });
  await expect(monitor.getByRole('article')).toHaveCount(3);
  await expect(monitor).toContainText('IT request for monitoring');
  await expect(monitor).toContainText('HR request for monitoring');
  await expect(monitor).toContainText('Finance request for monitoring');
  await expect(monitor).toContainText('HR One');
  const resolvedRequestCard = monitor.getByRole('article').filter({ hasText: 'Finance request for monitoring' });
  await expect(resolvedRequestCard.getByRole('button', { name: 'Manage assignment' })).toBeDisabled();
  const assignmentHelp = resolvedRequestCard.getByRole('tooltip');
  await expect(assignmentHelp).toBeHidden();
  await resolvedRequestCard.locator('.admin-request-manage-wrap').hover();
  await expect(assignmentHelp).toBeVisible();
  await expect(assignmentHelp).toHaveText('Resolved requests cannot be assigned.');

  await page.getByLabel('Department', { exact: true }).selectOption('DEPT-HR');
  await expect(monitor.getByRole('article')).toHaveCount(1);
  await expect(monitor).toContainText('HR request for monitoring');
  await expect(monitor).not.toContainText('IT request for monitoring');
  await expect(monitor).not.toContainText('Finance request for monitoring');
  await expect(monitor).toContainText('Showing 1 of 3 requests');

  await monitor.getByRole('button', { name: 'Manage assignment' }).click();
  await expect(monitor).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Manage request' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to requests' }).click();
  await expect(monitor).toBeVisible();
  await expect(page.getByLabel('Department', { exact: true })).toHaveValue('DEPT-HR');

  await page.getByLabel('Department', { exact: true }).selectOption('ALL');
  await expect(monitor.getByRole('article')).toHaveCount(3);

  await page.getByRole('button', { name: 'Refresh requests' }).click();
  await expect.poll(() => listCalls).toBeGreaterThan(1);
  await expect(monitor.getByRole('article')).toHaveCount(3);
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
  await expect(page.getByRole('heading', { name: 'All requests' })).toBeVisible();
  releaseOldProfile?.();
  await expect(page.getByRole('heading', { name: 'All requests' })).toBeVisible();
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
