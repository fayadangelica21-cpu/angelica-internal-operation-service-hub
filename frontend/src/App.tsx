import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AdminWorkloadSummary, assignRequestToStaff, AssignableStaff, createRequest, getAdminWorkload, getAllRequestsForAdmin, getAssignableStaff, getDepartmentQueue, getRequestForAssignment, getTriageSuggestion, listOwnRequests, reassignRequestDepartment, RequestRecord, resolveRequest, takeOwnership, TriageSuggestion } from './api';
import { AuthProvider, useAuth } from './auth';
import { AuthScreen } from './AuthScreen';

const DEPARTMENTS = [
  { id: 'DEPT-IT', label: 'IT' },
  { id: 'DEPT-HR', label: 'HR' },
  { id: 'DEPT-FINANCE', label: 'Finance' },
] as const;

function getDepartmentLabel(departmentId: string | null): string {
  if (!departmentId) return 'Unclear';
  const match = DEPARTMENTS.find((department) => department.id === departmentId);
  return match ? match.label : departmentId;
}

function formatSubmittedAt(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function getClassificationTone(classification: TriageSuggestion['classification']) {
  switch (classification) {
    case 'clear':
      return 'tone-good';
    case 'thin':
    case 'ambiguous':
      return 'tone-warn';
    case 'unrelated':
      return 'tone-bad';
    default:
      return 'tone-warn';
  }
}

export function App() {
  return <AuthProvider><RequestApp /></AuthProvider>;
}

function RequestApp() {
  const { user, loading: authLoading, logout } = useAuth();
  const [departmentId, setDepartmentId] = useState<string>('DEPT-IT');
  const [description, setDescription] = useState('');
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [triageSuggestion, setTriageSuggestion] = useState<TriageSuggestion | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [departmentQueue, setDepartmentQueue] = useState<RequestRecord[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [queueNotice, setQueueNotice] = useState('');
  const [queueActionId, setQueueActionId] = useState<string | null>(null);
  const [queueRemovingId, setQueueRemovingId] = useState<string | null>(null);
  const [ownRequests, setOwnRequests] = useState<RequestRecord[]>([]);
  const [ownRequestsLoading, setOwnRequestsLoading] = useState(false);
  const [ownRequestsError, setOwnRequestsError] = useState('');
  const [ownRequestsNotice, setOwnRequestsNotice] = useState('');
  const ownRequestsRefreshId = useRef(0);
  const [adminRequests, setAdminRequests] = useState<RequestRecord[]>([]);
  const [adminRequestsLoading, setAdminRequestsLoading] = useState(false);
  const [adminRequestsError, setAdminRequestsError] = useState('');
  const [adminRequestsNotice, setAdminRequestsNotice] = useState('');
  const [adminWorkload, setAdminWorkload] = useState<AdminWorkloadSummary>({ departments: [], staff: [] });
  const [adminWorkloadLoading, setAdminWorkloadLoading] = useState(false);
  const [adminWorkloadError, setAdminWorkloadError] = useState('');
  const adminRequestsRefreshId = useRef(0);
  const [adminDepartmentFilter, setAdminDepartmentFilter] = useState('ALL');
  const [assignmentRequest, setAssignmentRequest] = useState<RequestRecord | null>(null);
  const [assignableStaff, setAssignableStaff] = useState<AssignableStaff[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentSuccess, setAssignmentSuccess] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [adminScreen, setAdminScreen] = useState<'monitor' | 'workload' | 'assignment'>('monitor');
  const adminAssignmentLoadId = useRef(0);

  async function refreshOwnRequests(silent = false) {
    const refreshId = ++ownRequestsRefreshId.current;
    if (!silent) setOwnRequestsLoading(true);
    setOwnRequestsError('');
    setOwnRequestsNotice('');
    try {
      const nextRequests = await listOwnRequests();
      if (refreshId === ownRequestsRefreshId.current) setOwnRequests(nextRequests);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load your requests.';
      if (refreshId === ownRequestsRefreshId.current) {
        if (silent || ownRequests.length > 0) {
          setOwnRequestsNotice('Could not refresh your requests. The displayed list is unchanged; please try again.');
        } else {
          setOwnRequestsError(message);
        }
      }
    } finally {
      if (refreshId === ownRequestsRefreshId.current) setOwnRequestsLoading(false);
    }
  }

  async function refreshAdminRequests(silent = false) {
    const refreshId = ++adminRequestsRefreshId.current;
    if (!silent) {
      setAdminRequestsLoading(true);
      setAdminWorkloadLoading(true);
    }
    setAdminRequestsError('');
    setAdminRequestsNotice('');
    setAdminWorkloadError('');
    const [requestsResult, workloadResult] = await Promise.allSettled([
      getAllRequestsForAdmin(),
      getAdminWorkload(),
    ]);
    if (refreshId === adminRequestsRefreshId.current) {
      if (requestsResult.status === 'fulfilled') {
        setAdminRequests(requestsResult.value);
      } else {
        const err = requestsResult.reason;
        const message = err instanceof Error ? err.message : 'Unable to load requests across departments.';
        if (silent || adminRequests.length > 0) {
          setAdminRequestsNotice('Could not refresh all requests. The displayed list is unchanged; please try again.');
        } else {
          setAdminRequestsError(message);
        }
      }
      if (workloadResult.status === 'fulfilled') {
        setAdminWorkload(workloadResult.value);
      } else {
        const err = workloadResult.reason;
        setAdminWorkloadError(err instanceof Error ? err.message : 'Unable to load staff workload.');
      }
      if (!silent) {
        setAdminRequestsLoading(false);
        setAdminWorkloadLoading(false);
      }
    }
  }

  async function refreshDepartmentQueue(silent = false) {
    if (!silent) setQueueLoading(true);
    setQueueError('');
    setQueueNotice('');
    try {
      setDepartmentQueue(await getDepartmentQueue());
    } catch (err) {
      if (silent || departmentQueue.length > 0) {
        setQueueNotice('The queue could not be refreshed. The displayed requests are unchanged; please try again.');
      } else {
        setQueueError(err instanceof Error ? err.message : 'Unable to load the department queue.');
      }
    } finally {
      if (!silent) setQueueLoading(false);
    }
  }

  async function openAdminAssignment(item: RequestRecord) {
    const loadId = ++adminAssignmentLoadId.current;
    setAdminScreen('assignment');
    setAssignmentRequest(item);
    setAssignableStaff([]);
    setSelectedAssigneeId('');
    setTargetDepartmentId('');
    setAssignmentError('');
    setAssignmentSuccess('');
    setAssignmentLoading(true);
    try {
      const loadedRequest = await getRequestForAssignment(item.id);
      if (loadId !== adminAssignmentLoadId.current) return;
      setAssignmentRequest(loadedRequest);
      const staff = loadedRequest.status === 'Resolved' ? [] : await getAssignableStaff(loadedRequest.id);
      if (loadId !== adminAssignmentLoadId.current) return;
      setAssignableStaff(staff);
      if (loadedRequest.ownerId && staff.some((candidate) => candidate.id === loadedRequest.ownerId)) {
        setSelectedAssigneeId(loadedRequest.ownerId);
      }
    } catch (err) {
      if (loadId === adminAssignmentLoadId.current) {
        setAssignmentError(err instanceof Error ? err.message : 'Unable to load this request for assignment.');
      }
    } finally {
      if (loadId === adminAssignmentLoadId.current) setAssignmentLoading(false);
    }
  }

  function returnToAdminMonitor() {
    adminAssignmentLoadId.current += 1;
    setAdminScreen('monitor');
    setAssignmentRequest(null);
    setAssignableStaff([]);
    setSelectedAssigneeId('');
    setTargetDepartmentId('');
    setAssignmentError('');
    setAssignmentSuccess('');
    setAssignmentLoading(false);
  }

  function openOwnRequests() {
    setRequest(null);
    setShowHistory(true);
    setShowAssistant(false);
    void refreshOwnRequests(true);
  }

  async function saveAdminAssignment(event: React.FormEvent) {
    event.preventDefault();
    if (!assignmentRequest || !selectedAssigneeId) return;
    const wasAssigned = Boolean(assignmentRequest.ownerId);
    setAssignmentSaving(true);
    setAssignmentError('');
    setAssignmentSuccess('');
    try {
      const updatedRequest = await assignRequestToStaff(assignmentRequest.id, selectedAssigneeId);
      setAssignmentRequest(updatedRequest);
      const selectedStaff = assignableStaff.find((staff) => staff.id === updatedRequest.ownerId);
      setAdminRequests((current) => current.map((item) => item.id === updatedRequest.id
        ? { ...updatedRequest, ownerDisplayName: selectedStaff?.displayName || selectedStaff?.email || updatedRequest.ownerId || null }
        : item));
      setAssignmentSuccess(wasAssigned ? 'Request reassigned successfully.' : 'Request assigned successfully.');
      void refreshAdminRequests(true);
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : 'Unable to assign this request.');
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function moveAdminRequestDepartment(event: React.FormEvent) {
    event.preventDefault();
    if (!assignmentRequest || !targetDepartmentId) return;
    setAssignmentSaving(true);
    setAssignmentError('');
    setAssignmentSuccess('');
    try {
      const updatedRequest = await reassignRequestDepartment(assignmentRequest.id, targetDepartmentId);
      setAssignmentRequest(updatedRequest);
      setAdminRequests((current) => current.map((item) => item.id === updatedRequest.id
        ? { ...updatedRequest, ownerDisplayName: null }
        : item));
      setTargetDepartmentId('');
      setSelectedAssigneeId('');
      setAssignmentSuccess(`Request moved to ${getDepartmentLabel(updatedRequest.departmentId)} and returned to the Open queue.`);
      void refreshAdminRequests(true);
      try {
        setAssignableStaff(await getAssignableStaff(updatedRequest.id));
      } catch {
        setAssignableStaff([]);
        setAssignmentError('The department changed, but the Staff list could not be refreshed. Find the request again before assigning it.');
      }
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : 'Unable to move this request to another department.');
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function processQueueRequest(item: RequestRecord) {
    if (!user || user.role !== 'Staff') return;
    setQueueActionId(item.id);
    setQueueError('');
    try {
      if (item.status === 'Open') {
        const claimed = await takeOwnership(item.id, user.id);
        setDepartmentQueue((current) => [claimed, ...current.filter((request) => request.id !== item.id)]);
      } else if (item.status === 'In Progress') {
        await resolveRequest(item.id);
        setQueueRemovingId(item.id);
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        setDepartmentQueue((current) => current.filter((request) => request.id !== item.id));
      } else {
        return;
      }
      await refreshDepartmentQueue(true);
    } catch (err) {
      setQueueNotice(err instanceof Error ? err.message : 'Unable to update this request.');
    } finally {
      setQueueActionId(null);
      setQueueRemovingId(null);
    }
  }

  useEffect(() => {
    if (user?.role === 'Staff') void refreshDepartmentQueue();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'Admin') {
      setAdminRequests([]);
      setAdminRequestsLoading(false);
      setAdminRequestsError('');
      setAdminRequestsNotice('');
      setAdminWorkload({ departments: [], staff: [] });
      setAdminWorkloadLoading(false);
      setAdminWorkloadError('');
      setAdminDepartmentFilter('ALL');
      setAdminScreen('monitor');
      adminAssignmentLoadId.current += 1;
      return;
    }
    setAdminRequests([]);
    void refreshAdminRequests();
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAdminRequests(true);
    }, 5000);
    return () => {
      window.clearInterval(refreshInterval);
      adminRequestsRefreshId.current += 1;
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role === 'Admin') return;
    setAssignmentRequest(null);
    setAssignableStaff([]);
    setSelectedAssigneeId('');
    setTargetDepartmentId('');
    setAssignmentError('');
    setAssignmentSuccess('');
    setAssignmentLoading(false);
    setAssignmentSaving(false);
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'Employee') return;
    setOwnRequests([]);
    void refreshOwnRequests();
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshOwnRequests(true);
    }, 5000);
    return () => window.clearInterval(refreshInterval);
  }, [user?.id, user?.role]);

  const requestReady = description.trim().length > 0;
  const visibleAdminRequests = useMemo(
    () => adminDepartmentFilter === 'ALL'
      ? adminRequests
      : adminRequests.filter((item) => item.departmentId === adminDepartmentFilter),
    [adminDepartmentFilter, adminRequests],
  );
  const visibleWorkloadDepartments = useMemo(
    () => adminDepartmentFilter === 'ALL'
      ? adminWorkload.departments
      : adminWorkload.departments.filter((item) => item.departmentId === adminDepartmentFilter),
    [adminDepartmentFilter, adminWorkload.departments],
  );
  const visibleWorkloadStaff = useMemo(
    () => adminDepartmentFilter === 'ALL'
      ? adminWorkload.staff
      : adminWorkload.staff.filter((item) => item.departmentId === adminDepartmentFilter),
    [adminDepartmentFilter, adminWorkload.staff],
  );
  const helperText = useMemo(() => {
    if (!description.trim()) {
      return 'Describe the issue and let the assistant suggest the best department.';
    }
    return 'AI triage can help route the request before submission.';
  }, [description]);

  if (authLoading) {
    return <main className="app-shell"><section className="panel auth-panel" aria-live="polite">Checking your sign-in…</section></main>;
  }
  if (!user) return <AuthScreen />;
  if (user.role !== 'Employee') {
    if (user.role === 'Staff') {
      return (
        <main className="app-shell auth-shell department-queue-shell">
          <section className="panel department-queue-panel" aria-label="Department request queue">
            <div className="queue-heading">
              <div>
                <p className="eyebrow">Staff workspace</p>
                <h1>{getDepartmentLabel(user.departmentId ?? null)} request queue</h1>
              </div>
              <div className="admin-monitor-actions">
                <button
                  className="btn btn-secondary refresh-queue-button"
                  type="button"
                  onClick={() => void refreshDepartmentQueue()}
                  disabled={queueLoading || queueActionId !== null}
                  aria-busy={queueLoading}
                >
                  {queueLoading ? <><span className="queue-refresh-spinner" aria-hidden="true" />Refreshing queue…</> : 'Refresh queue'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => void logout()}>Sign out</button>
              </div>
            </div>
            <p className="auth-intro">Active requests assigned to your department.</p>
            {queueLoading && departmentQueue.length === 0 && <p role="status">Loading department requests…</p>}
            {queueError && <div className="error-box" role="alert">{queueError}</div>}
            {queueNotice && <div className="error-box" role="alert">{queueNotice}</div>}
            {!queueLoading && !queueError && !queueNotice && departmentQueue.length === 0 && (
              <p className="queue-empty">No active requests in your department.</p>
            )}
            <div className="department-queue-list">
              {!queueError && departmentQueue.map((item) => (
                <article
                  className={`status-card queue-request-card${queueRemovingId === item.id ? ' queue-request-card--removing' : ''}`}
                  key={item.id}
                >
                  <div className="status-row">
                    <strong>Request {item.id}</strong>
                    <span className="status-badge">{item.status}</span>
                  </div>
                  <p className="submitted-description">{item.description}</p>
                  <div className="queue-request-footer">
                    <span className="queue-department-label">{getDepartmentLabel(item.departmentId)}</span>
                    {item.status === 'Open' && (
                      <button
                        className="btn btn-primary queue-action-button"
                        type="button"
                        onClick={() => void processQueueRequest(item)}
                        disabled={queueLoading || queueActionId !== null}
                      >
                        {queueActionId === item.id ? 'Taking ownership…' : 'Take ownership'}
                      </button>
                    )}
                    {item.status === 'In Progress' && (
                      <button
                        className="btn btn-secondary queue-action-button"
                        type="button"
                        onClick={() => void processQueueRequest(item)}
                        disabled={queueLoading || queueActionId !== null}
                      >
                        {queueActionId === item.id ? 'Resolving…' : 'Resolve request'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      );
    }
    if (user.role === 'Admin') {
      return (
        <main className="app-shell auth-shell admin-workspace-shell">
          {adminScreen === 'monitor' ? (
          <section className="panel admin-monitor-panel" aria-label="All requests across departments">
            <div className="queue-heading">
              <div>
                <p className="eyebrow">Admin workspace</p>
                <h1>All requests</h1>
              </div>
              <div className="admin-monitor-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setAdminScreen('workload')}
                >
                  View workload
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void refreshAdminRequests()}
                  disabled={adminRequestsLoading}
                  aria-busy={adminRequestsLoading}
                >
                  {adminRequestsLoading ? 'Refreshing…' : 'Refresh requests'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => void logout()}>Sign out</button>
              </div>
            </div>
            <p className="auth-intro">Monitor requests from IT, HR, and Finance. The list refreshes automatically while this page is open.</p>
            <div className="admin-monitor-toolbar">
              <div className="field-group">
                <label className="field-label" htmlFor="admin-department-filter">Department</label>
                <select
                  id="admin-department-filter"
                  value={adminDepartmentFilter}
                  onChange={(event) => setAdminDepartmentFilter(event.target.value)}
                >
                  <option value="ALL">All departments</option>
                  {DEPARTMENTS.map((department) => (
                    <option key={department.id} value={department.id}>{department.label}</option>
                  ))}
                </select>
              </div>
              <p className="admin-monitor-count" aria-live="polite">
                Showing {visibleAdminRequests.length} of {adminRequests.length} requests
              </p>
            </div>
            {adminRequestsLoading && adminRequests.length === 0 && <p role="status">Loading all requests…</p>}
            {adminRequestsError && <div className="error-box" role="alert">{adminRequestsError}</div>}
            {adminRequestsNotice && <div className="error-box" role="alert">{adminRequestsNotice}</div>}
            {!adminRequestsLoading && !adminRequestsError && adminRequests.length === 0 && (
              <p className="request-history-empty">No requests have been submitted yet.</p>
            )}
            {!adminRequestsLoading && !adminRequestsError && adminRequests.length > 0 && visibleAdminRequests.length === 0 && (
              <p className="request-history-empty">No {getDepartmentLabel(adminDepartmentFilter)} requests found.</p>
            )}
            <div className="admin-request-list">
              {!adminRequestsError && visibleAdminRequests.map((item) => (
                <article className="admin-request-card" key={item.id}>
                  <div className="status-row">
                    <strong>Request {item.id}</strong>
                    <span className="status-badge">{item.status}</span>
                  </div>
                  <p className="admin-request-description">{item.description}</p>
                  <div className="admin-request-meta">
                    <span><strong>Department</strong>{getDepartmentLabel(item.departmentId)}</span>
                    <span><strong>Current owner</strong>{item.ownerDisplayName || item.ownerId || 'Unassigned'}</span>
                    {item.createdAt && <span><strong>Submitted</strong>{formatSubmittedAt(item.createdAt) || 'Unknown'}</span>}
                    {item.updatedAt && <span><strong>Last updated</strong>{formatSubmittedAt(item.updatedAt) || 'Unknown'}</span>}
                  </div>
                  <span
                    className="admin-request-manage-wrap"
                    tabIndex={item.status === 'Resolved' ? 0 : undefined}
                    aria-describedby={item.status === 'Resolved' ? `resolved-assignment-help-${item.id}` : undefined}
                  >
                    <button
                      className="btn btn-secondary admin-request-manage"
                      type="button"
                      onClick={() => void openAdminAssignment(item)}
                      disabled={item.status === 'Resolved'}
                    >
                      Manage assignment
                    </button>
                    {item.status === 'Resolved' && (
                      <span className="admin-request-manage-help" role="tooltip" id={`resolved-assignment-help-${item.id}`}>
                        Resolved requests cannot be assigned.
                      </span>
                    )}
                  </span>
                </article>
              ))}
            </div>
          </section>
          ) : adminScreen === 'workload' ? (
          <section className="panel admin-workload-panel" aria-label="Workload overview">
            <div className="queue-heading">
              <div>
                <p className="eyebrow">Admin workspace</p>
                <h1>Workload overview</h1>
              </div>
              <div className="admin-monitor-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void refreshAdminRequests()}
                  disabled={adminRequestsLoading}
                  aria-busy={adminRequestsLoading}
                >
                  {adminRequestsLoading ? 'Refreshing…' : 'Refresh workload'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={returnToAdminMonitor}>Back to requests</button>
              </div>
            </div>
            <p className="auth-intro">Active workload includes Open and In Progress requests; resolved requests are excluded.</p>
            <div className="admin-workload-toolbar">
              <div className="field-group">
                <label className="field-label" htmlFor="admin-department-filter">Department</label>
                <select
                  id="admin-department-filter"
                  value={adminDepartmentFilter}
                  onChange={(event) => setAdminDepartmentFilter(event.target.value)}
                >
                  <option value="ALL">All departments</option>
                  {DEPARTMENTS.map((department) => (
                    <option key={department.id} value={department.id}>{department.label}</option>
                  ))}
                </select>
              </div>
              {adminWorkloadLoading && <span role="status">Loading workload…</span>}
            </div>
            <div className="admin-workload-content">
            {adminWorkloadError && <div className="error-box" role="alert">{adminWorkloadError}</div>}
            <div className="admin-department-workload-list">
              {visibleWorkloadDepartments.map((item) => (
                <article className="admin-department-workload" key={item.departmentId}>
                  <h2>{getDepartmentLabel(item.departmentId)}</h2>
                  <strong>{item.activeRequestCount}</strong>
                  <span>active requests</span>
                  <small>{item.unassignedRequestCount} unassigned</small>
                  <small>{item.openRequestCount} Open · {item.inProgressRequestCount} In Progress</small>
                </article>
              ))}
            </div>
            <section className="admin-staff-workload" aria-label="Staff workload">
              <h2>Staff workload</h2>
              {!adminWorkloadLoading && !adminWorkloadError && visibleWorkloadStaff.length === 0 ? (
                <p className="request-history-empty">No registered Staff members in this view.</p>
              ) : (
                <div className="admin-workload-table-wrap">
                  <table className="admin-workload-table">
                    <caption>Active requests assigned to Staff members</caption>
                    <thead>
                      <tr><th scope="col">Staff member</th><th scope="col">Department</th><th scope="col">Active</th><th scope="col">Open</th><th scope="col">In progress</th></tr>
                    </thead>
                    <tbody>
                      {visibleWorkloadStaff.map((item) => (
                        <tr key={item.staffId}>
                          <th scope="row">{item.staffName}</th>
                          <td>{getDepartmentLabel(item.departmentId)}</td>
                          <td>{item.activeRequestCount}</td>
                          <td>{item.openRequestCount}</td>
                          <td>{item.inProgressRequestCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            </div>
          </section>
          ) : (
          <section className="panel admin-assignment-panel" aria-label="Admin request assignment">
            <div className="queue-heading">
              <div>
                <p className="eyebrow">Admin workspace</p>
                <h1>Manage request</h1>
              </div>
              <button className="btn btn-secondary" type="button" onClick={returnToAdminMonitor}>Back to requests</button>
            </div>
            <p className="auth-intro">Assign this request to Staff or move it to another department.</p>

            {assignmentError && <div className="error-box" role="alert">{assignmentError}</div>}
            {assignmentSuccess && <p className="assignment-success" role="status">{assignmentSuccess}</p>}

            {assignmentRequest && (
              <section className="status-card admin-assignment-request" aria-label="Request selected for assignment">
                <div className="status-row">
                  <strong>Request {assignmentRequest.id}</strong>
                  <span className="status-badge">{assignmentRequest.status}</span>
                </div>
                <p className="submitted-description">{assignmentRequest.description}</p>
                {assignmentLoading && <p role="status">Loading request details and Staff options…</p>}
                <div className="admin-assignment-meta">
                  <span><strong>Department</strong>{getDepartmentLabel(assignmentRequest.departmentId)}</span>
                  <span><strong>Current owner</strong>{assignmentRequest.ownerId
                    ? assignableStaff.find((candidate) => candidate.id === assignmentRequest.ownerId)?.displayName
                      || assignableStaff.find((candidate) => candidate.id === assignmentRequest.ownerId)?.email
                      || assignmentRequest.ownerId
                  : 'Unassigned'}</span>
                </div>

                {assignmentRequest.status !== 'Resolved' && (
                  <form className="admin-department-form" onSubmit={moveAdminRequestDepartment}>
                    <div className="field-group">
                      <label className="field-label" htmlFor="request-target-department">Move to another department</label>
                      <select
                        id="request-target-department"
                        value={targetDepartmentId}
                        onChange={(event) => setTargetDepartmentId(event.target.value)}
                        required
                        disabled={assignmentSaving}
                      >
                        <option value="" disabled>Select destination department</option>
                        {DEPARTMENTS.filter((department) => department.id !== assignmentRequest.departmentId).map((department) => (
                          <option key={department.id} value={department.id}>{department.label}</option>
                        ))}
                      </select>
                    </div>
                    <button className="btn btn-secondary" type="submit" disabled={assignmentSaving || !targetDepartmentId}>
                      {assignmentSaving ? 'Moving request…' : 'Move department'}
                    </button>
                  </form>
                )}

                {assignmentLoading ? null : assignmentRequest.status === 'Resolved' ? (
                  <p className="request-history-empty">Resolved requests cannot be assigned.</p>
                ) : assignableStaff.length === 0 ? (
                  <p className="request-history-empty">{assignmentError
                    ? 'Eligible Staff options are unavailable. Return to the request list and try again.'
                    : 'No Staff profiles are registered in this request’s department yet.'}</p>
                ) : (
                  <form className="admin-assignment-form" onSubmit={saveAdminAssignment}>
                    <div className="field-group">
                      <label className="field-label" htmlFor="request-assignee">Assign to Staff</label>
                      <select
                        id="request-assignee"
                        value={selectedAssigneeId}
                        onChange={(event) => setSelectedAssigneeId(event.target.value)}
                        required
                        disabled={assignmentSaving}
                      >
                        <option value="" disabled>Select a Staff member</option>
                        {assignableStaff.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.displayName || staff.email || staff.id}{staff.displayName && staff.email ? ` — ${staff.email}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={assignmentSaving || !selectedAssigneeId}>
                      {assignmentSaving ? 'Saving assignment…' : assignmentRequest.ownerId ? 'Reassign request' : 'Assign request'}
                    </button>
                  </form>
                )}
              </section>
            )}
          </section>
          )}
        </main>
      );
    }
    return (
      <main className="app-shell auth-shell">
        <section className="panel auth-panel" aria-label="Role access">
          <p className="eyebrow">Signed in</p>
          <h1>{user.role} workspace</h1>
          <p className="auth-intro">Your account is authenticated. The features for this role will be added in their own feature branch.</p>
          <button className="btn btn-secondary" type="button" onClick={() => void logout()}>Sign out</button>
        </section>
      </main>
    );
  }

  async function getSuggestion() {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setError('Enter a request description before asking for a triage suggestion.');
      return;
    }

    setError('');
    setShowHistory(false);
    setShowAssistant(true);
    setTriageLoading(true);
    setTriageSuggestion(null);

    try {
      const suggestion = await getTriageSuggestion(trimmedDescription, departmentId);
      setTriageSuggestion(suggestion);
      if (suggestion.departmentId) setDepartmentId(suggestion.departmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create a triage suggestion.');
    } finally {
      setTriageLoading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setRequest(null);
    setLoading(true);

    try {
      const created = await createRequest(departmentId, description.trim());
      setRequest(created);
      setOwnRequests((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      void refreshOwnRequests(true);
      setTriageSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected failure.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <div className={`layout ${showAssistant ? 'layout-two-panel' : showHistory ? 'layout-history-panel' : 'layout-one-panel'}`}>
        <section className="panel form-panel">
          <div className="queue-heading employee-workspace-heading">
            <div>
              <p className="eyebrow">Request intake</p>
              <h1>Internal Operations Service Hub</h1>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => void logout()}>Sign out</button>
          </div>

          <div className="employee-view-switch" role="tablist" aria-label="Employee workspace">
            <button type="button" role="tab" aria-selected={!showHistory} className={!showHistory ? 'is-selected' : ''}
              onClick={() => { setShowHistory(false); setShowAssistant(false); }}>New request</button>
            <button type="button" role="tab" aria-selected={showHistory} className={showHistory ? 'is-selected' : ''}
              onClick={() => { setShowHistory(true); setShowAssistant(false); void refreshOwnRequests(true); }}>My requests</button>
          </div>

          {!showHistory && <div className="employee-view-content employee-view-enter">
          <form onSubmit={submit} className="request-form">
            <div className="field-group">
              <label className="field-label">Department</label>
              <div className="segmented" role="radiogroup" aria-label="Department">
                {DEPARTMENTS.map((department) => (
                  <button
                    key={department.id}
                    type="button"
                    className={`segment ${departmentId === department.id ? 'is-selected' : ''}`}
                    onClick={() => setDepartmentId(department.id)}
                    aria-pressed={departmentId === department.id}
                    aria-label={department.label}
                  >
                    {department.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="description" className="field-label">
                Description
              </label>
              <textarea
                id="description"
                aria-label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                maxLength={1000}
                placeholder="Describe the issue, access problem, payroll question, or policy question..."
              />
            </div>

            <div className="helper-row">
              <span>{helperText}</span>
            </div>

            <div className="actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={getSuggestion}
                disabled={triageLoading || !requestReady}
              >
                {triageLoading ? 'Thinking…' : 'Get AI suggestion'}
              </button>

              <button type="submit" className="btn btn-primary" disabled={loading || !requestReady}>
                {loading ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>

          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}

          {request && (
            createPortal(<div className="submission-dialog-backdrop">
              <section className="submission-dialog" role="dialog" aria-modal="true" aria-labelledby="submission-dialog-title">
                <button className="submission-dialog-close" type="button" aria-label="Close submission confirmation" onClick={() => setRequest(null)}>×</button>
                <div className="submission-dialog-kicker">
                  <div className="submission-success-icon" aria-hidden="true">✓</div>
                  <p className="eyebrow">Successfully submitted</p>
                </div>
                <h2 id="submission-dialog-title">Request submitted</h2>
                <p className="submission-dialog-copy">Your request was submitted successfully. Open the <strong>My requests</strong> tab to see its status and updates.</p>
                <div className="submission-request-id">
                  <span className="meta-label">Request ID</span>
                  <strong>{request.id}</strong>
                </div>
                <div className="submission-dialog-actions">
                  <button className="btn btn-primary" type="button" onClick={openOwnRequests}>Go to My requests</button>
                  <button className="btn btn-secondary" type="button" onClick={() => setRequest(null)}>Continue submitting</button>
                </div>
              </section>
            </div>, document.body)
          )}
          </div>}

          {showHistory && (
            <section className="employee-view-content employee-view-enter" aria-label="Your requests">
              <div className="request-history-heading">
              <div>
                <h2>Your requests</h2>
                <p>Check the current status of requests you submitted.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary refresh-requests-button"
                aria-label="Refresh requests"
                onClick={() => void refreshOwnRequests()}
                disabled={ownRequestsLoading}
                aria-busy={ownRequestsLoading}
              >
                {ownRequestsLoading
                  ? <><span className="queue-refresh-spinner" aria-hidden="true" />Refreshing…</>
                  : 'Refresh'}
              </button>
            </div>
            {ownRequestsLoading && <p className="request-history-message" role="status">Loading your requests…</p>}
              {ownRequestsError && <div className="error-box" role="alert">{ownRequestsError}</div>}
              {ownRequestsNotice && <div className="error-box" role="alert">{ownRequestsNotice}</div>}
              <div className="request-history-list">
                {!ownRequestsLoading && !ownRequestsError && !ownRequestsNotice && ownRequests.length === 0 && (
                  <p className="request-history-empty">No requests yet. Submitted requests will appear here.</p>
                )}
                {!ownRequestsError && ownRequests.map((item) => {
                  const statusClass = item.status.toLowerCase().replace(/\s+/g, '-');
                  const submittedAt = formatSubmittedAt(item.createdAt);
                  return (
                    <article className="request-history-card" key={item.id}>
                      <div className="request-history-card-heading">
                        <strong>Request {item.id}</strong>
                        <span className={`status-badge request-history-status request-history-status--${statusClass}`}>
                          {item.status}
                        </span>
                      </div>
                      <p className="request-history-description">{item.description}</p>
                      <div className="request-history-meta">
                        <span>{getDepartmentLabel(item.departmentId)}</span>
                        {submittedAt && <time dateTime={item.createdAt}>{submittedAt}</time>}
                      </div>
                      <div className="request-history-timeline-block">
                        <h3>Status history</h3>
                        {item.statusHistory && item.statusHistory.length > 0 ? (
                          <ol className="request-history-timeline" aria-label={`Status history for request ${item.id}`}>
                            {item.statusHistory.map((event) => (
                              <li key={event.historyId}>
                                <span className="request-history-event-status">
                                  {event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : `Submitted as ${event.toStatus}`}
                                </span>
                                <time dateTime={event.changedAt}>{formatSubmittedAt(event.changedAt) || 'Time unavailable'}</time>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="request-history-no-events">Status history is not available for this request.</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </section>

        {showAssistant && (
          <aside className={`panel assistant-panel ${triageLoading ? 'is-thinking' : ''} ${triageSuggestion ? 'has-result' : ''}`}>
            <div className="assistant-header">
            <div>
              <p className="eyebrow">AI assistant</p>
              <h2>Smart triage</h2>
            </div>
          </div>

            {!triageLoading && !triageSuggestion && (
              <div className="assistant-empty">
                <div className="spark" aria-hidden="true" />
                <p>
                  Paste in an issue summary and I’ll suggest the most likely department and next step.
                </p>
              </div>
            )}

            {triageLoading && (
              <div className="assistant-loading" aria-live="polite">
                <div className="loading-sphere" aria-hidden="true" />
                <p>
                  Paste in an issue summary and I’ll suggest the most likely department and next step.
                </p>
              </div>
            )}

            {triageSuggestion && (
              <div className="suggestion-card" aria-live="polite">
                <div className="suggestion-topline">
                  <span
                    className={`status-badge ${getClassificationTone(triageSuggestion.classification)}`}
                    aria-label={`Classification ${triageSuggestion.classification}`}
                  >
                    {triageSuggestion.classification}
                  </span>
                  <span className="confidence-pill" aria-label={`Confidence ${Math.round(triageSuggestion.confidence * 100)} percent`}>
                    {Math.round(triageSuggestion.confidence * 100)}% confidence
                  </span>
                </div>

                <h3>Recommended route</h3>

                <div className="info-grid">
                  <div>
                    <span className="meta-label">Department</span>
                    <strong>{getDepartmentLabel(triageSuggestion.departmentId)}</strong>
                  </div>
                  <div>
                    <span className="meta-label">Issue type</span>
                    <strong>{triageSuggestion.issueType}</strong>
                  </div>
                </div>

                <div className="confidence-meter" aria-label={`Confidence ${triageSuggestion.confidence * 100}%`}>
                  <span style={{ width: `${Math.round(triageSuggestion.confidence * 100)}%` }} />
                </div>

                <div className="suggestion-block">
                  <span className="meta-label">Suggested next step</span>
                  <p>{triageSuggestion.suggestedNextStep}</p>
                </div>

                <div className="suggestion-block">
                  <span className="meta-label">Reasoning</span>
                  <p>{triageSuggestion.reasoning}</p>
                </div>

                <div className="suggestion-block">
                  <span className="meta-label">Requires more info</span>
                  <p>{triageSuggestion.requiresMoreInfo ? 'Yes' : 'No'}</p>
                </div>

              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
