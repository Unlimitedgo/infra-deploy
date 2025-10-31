import express from 'express';
import auth from 'basic-auth';
import { exec } from 'child_process';
import os from 'os';

const app = express();
const PORT = 4000;

const PANEL_USER = process.env.PANEL_USER || 'admin';
const PANEL_PASS = process.env.PANEL_PASS || 'password';
const WA_BOT_ENABLED = (process.env.WA_BOT_ENABLED || 'false') === 'true';

function requireAuth(req, res, next) {
  const user = auth(req);
  if (!user || user.name !== PANEL_USER || user.pass !== PANEL_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Restricted"');
    return res.status(401).send('Authentication required.');
  }
  return next();
}

app.use(requireAuth);

function execPromise(command) {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: true, stdout: stdout.toString(), stderr: stderr.toString() });
      } else {
        resolve({ error: false, stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
}

app.get('/metrics.json', async (req, res) => {
  try {
    const hostname = os.hostname();
    const uptime = process.uptime();
    const loadavg = os.loadavg();

    const freeM = await execPromise('free -m');
    const dfH = await execPromise('df -h /srv/stack');
    const composePs = await execPromise('docker compose ps --format json || docker ps --format "{{json .}}"');

    const lastDeploy = await execPromise('cat /srv/stack/.last_deploy 2>/dev/null || true');

    res.json({
      hostname,
      uptime,
      loadavg,
      ram: freeM.stdout,
      disk: dfH.stdout,
      containers: composePs.stdout,
      waBotEnabled: WA_BOT_ENABLED,
      lastDeploy: lastDeploy.stdout.trim() || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'metrics_error', message: String(e) });
  }
});

app.get('/', (req, res) => {
  const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VPS Admin Panel</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  </head>
  <body class="bg-light">
    <div class="container py-4">
      <h1 class="mb-4">VPS Admin Panel</h1>
      <div class="mb-3">
        <button id="refresh" class="btn btn-primary">Aggiorna dati</button>
      </div>
      <div id="cards" class="row g-3">
        <!-- Cards generate via JS -->
      </div>
    </div>
    <script>
      async function load() {
        const res = await fetch('/metrics.json', { cache: 'no-store' });
        const data = await res.json();
        const ok = (val) => val && typeof val === 'string' ? val.replace(/</g,'&lt;') : val;
        const containerOk = data.containers && data.containers.length > 0;
        const cards = [
          { title: 'CPU', body: 'Loadavg: ' + ok((data.loadavg||[]).map(v=>v.toFixed?v.toFixed(2):v).join(', ')) },
          { title: 'RAM', body: '<pre class="mb-0">' + ok(data.ram) + '</pre>' },
          { title: 'Disco /srv/stack', body: '<pre class="mb-0">' + ok(data.disk) + '</pre>' },
          { title: 'Containers', body: containerOk ? '<span class="text-success fw-bold">OK</span>' : '<span class="text-danger fw-bold">KO</span>' },
          { title: 'Ultimo Deploy', body: ok(data.lastDeploy||'N/D') },
          { title: 'Bot abilitato', body: ${WA_BOT_ENABLED ? "'Sì'" : "'No'"} }
        ];
        const container = document.getElementById('cards');
        container.innerHTML = cards.map(c => `
          <div class="col-12 col-md-6 col-lg-4">
            <div class="card h-100">
              <div class="card-body">
                <h5 class="card-title">${'${c.title}'}</h5>
                <div class="card-text">${'${c.body}'}</div>
              </div>
            </div>
          </div>`).join('');
      }
      document.getElementById('refresh').addEventListener('click', load);
      load();
    </script>
  </body>
  </html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`VPS Admin Panel in ascolto su :${PORT}`);
});


