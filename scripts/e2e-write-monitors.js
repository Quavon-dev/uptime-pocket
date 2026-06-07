/**
 * Live E2E test: add / edit / delete a monitor against the real
 * Kuma 2.3.2 instance at uptime.quavon.de.
 *
 * Run with:
 *   cat /root/.hermes-private/kuma-pw | node /root/projects/uptime-pocket/scripts/e2e-write-monitors.js
 */

const { io } = require('socket.io-client');
const fs = require('fs');

const URL = 'https://uptime.quavon.de';
const USER = 'quavon';
const PASS = fs.readFileSync('/root/.hermes-private/kuma-pw', 'utf8').trim();

const sock = io(URL, { transports: ['websocket'], reconnection: false });

sock.on('connect', () => {
  console.log('[1] connected');
  sock.emit('login', { username: USER, password: PASS }, async (loginRes) => {
    if (!loginRes || !loginRes.ok) { console.error('login failed', loginRes); process.exit(1); }
    console.log('[2] logged in, token len', loginRes.token.length);

    // 1) ADD
    const draft = {
      type: 'http',
      name: '__e2e_probe_' + Date.now() + '__',
      url: 'https://example.com',
      method: 'GET',
      interval: 60,
      retryInterval: 60,
      maxretries: 0,
      upsideDown: false,
      active: true,
      notificationIDList: {},
      accepted_statuscodes: ['200-299'],
      httpBodyEncoding: 'json',
      ignoreTls: false,
      maxredirects: 10,
    };
    sock.emit('add', draft, (addRes) => {
      console.log('[3] add result:', JSON.stringify(addRes).slice(0, 200));
      if (!addRes || !addRes.ok) { process.exit(1); }
      const newId = addRes.monitorID;

      // 2) GET
      sock.emit('getMonitor', newId, (gW) => {
        const g = gW && gW.monitor;
        console.log('[4] getMonitor #', newId, 'name=', g.name, 'url=', g.url, 'type=', g.type);
        if (!g) { process.exit(1); }

        // 3) EDIT (full bean)
        g.name = '__e2e_edited_' + Date.now() + '__';
        g.interval = 120;
        g.url = 'https://example.com/edited';
        sock.emit('editMonitor', g, (e) => {
          console.log('[5] edit result:', JSON.stringify(e).slice(0, 200));
          sock.emit('getMonitor', newId, (gW2) => {
            const g2 = gW2 && gW2.monitor;
            console.log('[6] post-edit: name=', g2.name, 'url=', g2.url, 'interval=', g2.interval);

            // 4) DELETE
            sock.emit('deleteMonitor', newId, (d) => {
              console.log('[7] delete result:', JSON.stringify(d).slice(0, 200));
              sock.emit('getMonitor', newId, (g9) => {
                console.log('[8] post-delete getMonitor:', g9 && g9.ok ? 'STILL THERE (bug!)' : 'gone (err=' + (g9 && g9.msg || 'unknown') + ')');
                console.log('---');
                console.log(addRes.ok && e.ok && d.ok ? 'E2E PASS' : 'E2E FAIL');
                sock.disconnect();
                process.exit(addRes.ok && e.ok && d.ok ? 0 : 1);
              });
            });
          });
        });
      });
    });
  });
});

sock.on('connect_error', (e) => { console.error('connect_error', e.message); process.exit(1); });
setTimeout(() => { console.error('overall timeout'); process.exit(1); }, 30000);
