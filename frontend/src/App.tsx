import React, { useState } from 'react';
import { createRequest, RequestRecord } from './api';

const DEPARTMENTS = [
  { id: 'DEPT-IT', label: 'IT' },
  { id: 'DEPT-HR', label: 'HR' },
  { id: 'DEPT-FINANCE', label: 'Finance' },
];

export function App() {
  const [departmentId, setDepartmentId] = useState('DEPT-IT');
  const [description, setDescription] = useState('');
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setRequest(null);
    setLoading(true);
    try {
      const created = await createRequest(departmentId, description);
      setRequest(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected failure.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Internal Operations Service Hub</h1>
      <p>Submit one internal service request.</p>
      <form onSubmit={submit}>
        <label>
          Department
          <select
            aria-label="Department"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            {DEPARTMENTS.map((department) => (
              <option key={department.id} value={department.id}>
                {department.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            aria-label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            maxLength={1000}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Submitting…' : 'Submit request'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {request && (
        <section aria-label="Created request">
          <h2>Request submitted</h2>
          <p>
            <strong>ID:</strong> {request.id}
          </p>
            <p aria-label="Request status">
              <strong>Status:</strong> {request.status}
          </p>
          <p>{request.description}</p>
        </section>
      )}
    </main>
  );
}
