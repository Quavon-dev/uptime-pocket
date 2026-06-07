const { io } = require('socket.io-client');
const fs = require('fs');

const URL = 'https://uptime.quavon.de';
const USER = 'quavon';
const PASS = fs.readFileSync('/root/.hermes-private/kuma-pw', 'utf8').trim();

const sock = io(URL, { transports: ['websocket'], reconnection: false });

const created = [];

function cleanup() {
  let i = 0;
  function next() {
    if (i >= created.length) { sock.disconnect(); process.exit(0); return; }
    const id = created[i++];
    sock.emit('deleteMonitor', id, (d) => {
      console.log('  cleaned up #' + id + ':', d && d.ok ? 'OK' : 'FAIL');
      next();
    });
  }
  next();
}

sock.on('connect', () => {
  console.log('[1] connected + logged in');
  sock.emit('login', { username: USER, password: PASS }, (r) => {
    if (!r.ok) { process.exit(1); }

    // Test 1: PING monitor
    sock.emit('add', {
      type: 'ping',
      name: '__e2e_ping__',
      hostname: '1.1.1.1',
      accepted_statuscodes: ['200-299'],
      interval: 60, retryInterval: 60, maxretries: 0,
      active: true, upsideDown: false,
    }, (pingRes) => {
      console.log('[2] add ping:', pingRes.ok ? 'OK #' + pingRes.monitorID : 'FAIL: ' + pingRes.msg);
      if (pingRes.ok) created.push(pingRes.monitorID);

      // Test 2: PORT monitor
      sock.emit('add', {
        type: 'port',
        name: '__e2e_port__',
        hostname: '1.1.1.1',
        port: 53,
        accepted_statuscodes: ['200-299'],
        interval: 60, retryInterval: 60, maxretries: 0,
        active: true, upsideDown: false,
      }, (portRes) => {
        console.log('[3] add port:', portRes.ok ? 'OK #' + portRes.monitorID : 'FAIL: ' + portRes.msg);
        if (portRes.ok) created.push(portRes.monitorID);

        // Test 3: DNS monitor
        sock.emit('add', {
          type: 'dns',
          name: '__e2e_dns__',
          hostname: 'example.com',
          dns_resolve_type: 'A',
          dns_resolve_server: '1.1.1.1',
          accepted_statuscodes: ['200-299'],
          interval: 60, retryInterval: 60, maxretries: 0,
          active: true, upsideDown: false,
        }, (dnsRes) => {
          console.log('[4] add dns:', dnsRes.ok ? 'OK #' + dnsRes.monitorID : 'FAIL: ' + dnsRes.msg);
          if (dnsRes.ok) created.push(dnsRes.monitorID);

          // Test 4: KEYWORD monitor
          sock.emit('add', {
            type: 'keyword',
            name: '__e2e_keyword__',
            url: 'https://example.com',
            keyword: 'Example',
            accepted_statuscodes: ['200-299'],
            interval: 60, retryInterval: 60, maxretries: 0,
            active: true, upsideDown: false,
          }, (kwRes) => {
            console.log('[5] add keyword:', kwRes.ok ? 'OK #' + kwRes.monitorID : 'FAIL: ' + kwRes.msg);
            if (kwRes.ok) created.push(kwRes.monitorID);

            console.log('---');
            console.log('Cleaning up', created.length, 'monitors...');
            cleanup();
          });
        });
      });
    });
  });
});

sock.on('connect_error', (e) => { console.error('connect_error', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 25000);
