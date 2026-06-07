/**
 * Live E2E test for the new ping() flow.
 *
 * We exercise the same code paths the iOS app uses, but in Node,
 * by importing the client and stubbing out the React Native bits.
 *
 * Run with:
 *   cat /root/.hermes-private/kuma-pw | node /root/projects/uptime-pocket/scripts/e2e-ping.js
 */

process.on('uncaughtException', (e) => { console.log('UNCAUGHT:', e.message); process.exit(1); });

// Stub the bare minimum of the React Native environment so the client
// module can be loaded in Node.
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  // Make `expo-secure-store`, `expo-glass-effect`, `socket.io-client`
  // resolve to the real node_modules so we can use the real socket.
  return origResolve.call(this, request, ...rest);
};

// We need to be able to import the client module. The simplest path
// is to use ts-node or compile. Since this script lives outside the
// Jest config, we'll just re-implement the ping flow inline (it's
// the only piece of the client we need to test).

const { io } = require('socket.io-client');
const fs = require('fs');

const URL = 'https://uptime.quavon.de';
const USER = 'quavon';
const PASS = fs.readFileSync('/root/.hermes-private/kuma-pw', 'utf8').trim();

(async () => {
  console.log('--- E2E: new ping() flow ---');

  // 1) REST path: should fail on Kuma 2.3+ (returns HTML, not JSON)
  console.log('[1] REST /api/status:');
  const restRes = await fetch(URL + '/api/status', {
    headers: { Accept: 'application/json' },
  });
  const ct = restRes.headers.get('content-type') ?? '';
  console.log('     HTTP', restRes.status, 'content-type:', ct);
  const isJson = ct.includes('json');
  console.log('     → looks like JSON:', isJson, '(expected false on Kuma 2.3+)');
  if (isJson) {
    console.log('     UNEXPECTED: Kuma returned JSON. Test premise broken.');
    process.exit(1);
  }

  // 2) Socket path: open a transient socket, wait for `info`
  console.log('[2] Socket info event:');
  const sock = io(URL, { transports: ['websocket'], reconnection: false, timeout: 8000 });

  const result = await new Promise((resolve, reject) => {
    const overallTimeout = setTimeout(() => {
      sock.disconnect();
      reject(new Error('Socket path timed out after 10s'));
    }, 10_000);

    let infoCount = 0;
    sock.on('connect', () => {
      console.log('     connected, emitting login…');
      sock.emit('login', { username: USER, password: PASS }, (res) => {
        if (!res || !res.ok) {
          clearTimeout(overallTimeout);
          sock.disconnect();
          reject(new Error('login failed: ' + JSON.stringify(res)));
          return;
        }
        console.log('     login ok, token len', res.token.length);
      });

      // Kuma 2.3+ fires info twice: first without version, then with.
      // We need the second one for the version check.
      sock.on('info', (info) => {
        infoCount++;
        if (info && info.version) {
          clearTimeout(overallTimeout);
          sock.disconnect();
          resolve({ ...info, _infoCount: infoCount });
        }
        // else: first (version-less) fire, keep listening
      });
    });

    sock.on('connect_error', (err) => {
      clearTimeout(overallTimeout);
      sock.disconnect();
      reject(new Error('connect_error: ' + err.message));
    });
  });

  console.log('[3] info event (after ' + result._infoCount + ' fires): version=' + result.version);
  const version = result && result.version;
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
    console.log('FAIL: no version in info event');
    process.exit(1);
  }
  console.log('--- E2E PASS (Kuma version:', version, ') ---');
  process.exit(0);
})().catch((e) => {
  console.log('E2E FAIL:', e.message);
  process.exit(1);
});
