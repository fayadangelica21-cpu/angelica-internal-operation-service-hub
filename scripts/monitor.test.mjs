// Tests the monitor's state machine against a scripted fake health endpoint. Run: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MONITOR = fileURLToPath(new URL('./monitor.mjs', import.meta.url));

async function run(sequence) {
  let i = 0;
  const server = http.createServer((_req, res) => {
    const bad = sequence[Math.min(i++, sequence.length - 1)] === 'bad';
    res.writeHead(bad ? 503 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: bad ? 'down' : 'ok', release: 'testrel', checks: { database: bad ? 'fail' : 'ok' } }));
  });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/health/ready`;
  const out = await new Promise((resolve) => {
    let buf = '';
    const p = spawn(process.execPath, [MONITOR], {
      env: { ...process.env, MONITOR_URL: url, INTERVAL_MS: '30', MAX_CHECKS: String(sequence.length) },
    });
    p.stdout.on('data', (d) => (buf += d));
    p.on('close', () => resolve(buf));
  });
  server.close();
  return out.trim().split('\n').map((l) => JSON.parse(l).event);
}

test('degraded x3 -> alert -> ok -> resolved -> ok ok ok', async () => {
  const events = await run(['bad', 'bad', 'bad', 'ok', 'ok', 'ok', 'ok']);
  assert.deepEqual(events, [
    'monitor.started',
    'monitor.degraded', 'monitor.degraded', 'monitor.degraded',
    'monitor.alert',
    'monitor.ok', 'monitor.resolved',
    'monitor.ok', 'monitor.ok', 'monitor.ok',
  ]);
});

test('the alert fires only once while the outage continues', async () => {
  const events = await run(['bad', 'bad', 'bad', 'bad', 'bad', 'ok']);
  assert.equal(events.filter((e) => e === 'monitor.alert').length, 1);
});

test('two bad checks followed by an OK never alert', async () => {
  const events = await run(['bad', 'bad', 'ok', 'ok']);
  assert.equal(events.includes('monitor.alert'), false);
  assert.equal(events.includes('monitor.resolved'), false);
});
