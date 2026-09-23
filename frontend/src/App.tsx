import React, { useMemo, useState } from 'react';
import { createRequest, getTriageSuggestion, RequestRecord, TriageSuggestion } from './api';

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
  const [departmentId, setDepartmentId] = useState<string>('DEPT-IT');
  const [description, setDescription] = useState('');
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [triageSuggestion, setTriageSuggestion] = useState<TriageSuggestion | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  const requestReady = description.trim().length > 0;

  const helperText = useMemo(() => {
    if (!description.trim()) {
      return 'Describe the issue and let the assistant suggest the best department.';
    }
    return 'AI triage can help route the request before submission.';
  }, [description]);

  async function getSuggestion() {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setError('Enter a request description before asking for a triage suggestion.');
      return;
    }

    setError('');
    setShowAssistant(true);
    setTriageLoading(true);
    setTriageSuggestion(null);

    try {
      const suggestion = await getTriageSuggestion(trimmedDescription, departmentId);
      setTriageSuggestion(suggestion);
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
      setTriageSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected failure.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <div className={`layout ${showAssistant ? 'layout-two-panel' : 'layout-one-panel'}`}>
        <section className="panel form-panel">
          <div className="panel-header">
            <p className="eyebrow">Request intake</p>
            <h1>Internal Operations Service Hub</h1>
          </div>

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
            <section className="status-card" aria-label="Created request">
              <div className="status-row">
                <span className="eyebrow">Submitted</span>
                <span className="status-badge" aria-label={`Request status ${request.status}`}>
                  {request.status}
                </span>
              </div>

              <h2>Request submitted</h2>

              <div className="meta-grid">
                <div>
                  <span className="meta-label">Request ID</span>
                  <strong>{request.id}</strong>
                </div>
                <div>
                  <span className="meta-label">Department</span>
                  <strong>{getDepartmentLabel(request.departmentId)}</strong>
                </div>
              </div>

              <p className="submitted-description">{request.description}</p>
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

                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDepartmentId(triageSuggestion.departmentId ?? departmentId)}
                  >
                    Use suggested department
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
