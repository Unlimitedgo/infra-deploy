import express from 'express';
import auth from 'basic-auth';
import { exec } from 'child_process';
import os from 'os';
import { readFile, writeFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import multer from 'multer';
import { promisify } from 'util';

const app = express();
const PORT = 4000;

const PANEL_USER = process.env.PANEL_USER || 'admin';
const PANEL_PASS = process.env.PANEL_PASS || 'password';
const WA_BOT_ENABLED = (process.env.WA_BOT_ENABLED || 'false') === 'true';

// Costanti per percorsi
const ENV_FILE_PATH = '/srv/stack/.env';
const GESTIONALE_PATH = '/srv/stack/gestionale';
const CADDYFILE_PATH = '/srv/stack/infra-deploy/Caddyfile';

function requireAuth(req, res, next) {
  const user = auth(req);
  if (!user || user.name !== PANEL_USER || user.pass !== PANEL_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Restricted"');
    return res.status(401).send('Authentication required.');
  }
  return next();
}

app.use(express.json());
app.use(express.text({ type: 'text/plain', limit: '10mb' }));
app.use(requireAuth);

// Configurazione multer per upload file
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});

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
        <a href="/upload" class="btn btn-success ms-2">Upload Gestionale</a>
        <a href="/domains" class="btn btn-info ms-2 text-white">Gestisci Domini</a>
        <a href="/env" class="btn btn-secondary ms-2">Configurazione (.env)</a>
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
          { title: 'Bot abilitato', body: data.waBotEnabled ? 'Sì' : 'No' }
        ];
        const container = document.getElementById('cards');
        container.innerHTML = cards.map(c => '<div class="col-12 col-md-6 col-lg-4">' +
          '<div class="card h-100">' +
          '<div class="card-body">' +
          '<h5 class="card-title">' + c.title + '</h5>' +
          '<div class="card-text">' + c.body + '</div>' +
          '</div></div></div>').join('');
      }
      document.getElementById('refresh').addEventListener('click', load);
      load();
    </script>
  </body>
  </html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Rotte per gestione file .env
app.get('/env', async (req, res) => {
  try {
    let content = '';
    if (existsSync(ENV_FILE_PATH)) {
      content = await readFile(ENV_FILE_PATH, 'utf-8');
    }
    
    const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gestione Configurazione - VPS Admin Panel</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
    <style>
      textarea { font-family: monospace; font-size: 0.9rem; }
    </style>
  </head>
  <body class="bg-light">
    <div class="container py-4">
      <div class="mb-3">
        <a href="/" class="btn btn-outline-secondary">← Torna alla Dashboard</a>
      </div>
      <h1 class="mb-4">Gestione Configurazione (.env)</h1>
      <div class="alert alert-info">
        <strong>Attenzione:</strong> Le modifiche al file .env richiedono il riavvio dei servizi per essere applicate.
      </div>
      <form id="envForm" class="mb-3">
        <div class="mb-3">
          <label for="envContent" class="form-label">Contenuto file /srv/stack/.env</label>
          <textarea class="form-control" id="envContent" rows="25" name="content">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-primary">Salva modifiche</button>
          <button type="button" id="restartBtn" class="btn btn-success">Salva e Riavvia Servizi</button>
          <button type="button" id="cancelBtn" class="btn btn-secondary">Annulla</button>
        </div>
      </form>
      <div id="message"></div>
    </div>
    <script>
      const form = document.getElementById('envForm');
      const messageDiv = document.getElementById('message');
      const restartBtn = document.getElementById('restartBtn');
      
      function showMessage(text, type = 'info') {
        messageDiv.innerHTML = '<div class="alert alert-' + type + ' alert-dismissible fade show" role="alert">' +
          text + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
        setTimeout(() => messageDiv.innerHTML = '', 5000);
      }
      
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = document.getElementById('envContent').value;
        try {
          const res = await fetch('/env', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: content
          });
          const result = await res.json();
          if (result.success) {
            showMessage('File .env salvato con successo!', 'success');
          } else {
            showMessage('Errore: ' + (result.error || 'Errore sconosciuto'), 'danger');
          }
        } catch (err) {
          showMessage('Errore durante il salvataggio: ' + err.message, 'danger');
        }
      });
      
      restartBtn.addEventListener('click', async () => {
        const content = document.getElementById('envContent').value;
        if (!confirm('Vuoi salvare le modifiche e riavviare tutti i servizi? Questa operazione può richiedere qualche momento.')) {
          return;
        }
        try {
          const res = await fetch('/env?restart=true', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: content
          });
          const result = await res.json();
          if (result.success) {
            showMessage('File .env salvato e servizi in riavvio. Controlla i log per verificare lo stato.', 'success');
          } else {
            showMessage('Errore: ' + (result.error || 'Errore sconosciuto'), 'danger');
          }
        } catch (err) {
          showMessage('Errore durante il salvataggio/riavvio: ' + err.message, 'danger');
        }
      });
      
      document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = '/';
      });
    </script>
  </body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).send('Errore nel caricamento del file: ' + String(e));
  }
});

app.post('/env', async (req, res) => {
  try {
    const content = typeof req.body === 'string' ? req.body : req.body.content || '';
    const shouldRestart = req.query.restart === 'true';
    
    // Salva il file
    await writeFile(ENV_FILE_PATH, content, 'utf-8');
    
    let restartOutput = '';
    if (shouldRestart) {
      // Riavvia i servizi Docker Compose
      const restartResult = await execPromise('cd /srv/stack/infra-deploy && docker compose --env-file /srv/stack/.env up -d');
      restartOutput = restartResult.stdout + (restartResult.stderr || '');
    }
    
    res.json({
      success: true,
      message: shouldRestart ? 'File salvato e servizi riavviati' : 'File salvato con successo',
      restartOutput: shouldRestart ? restartOutput : undefined
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: String(e)
    });
  }
});

// Funzione per rigenerare Caddyfile basandosi sul .env
async function regenerateCaddyfile() {
  try {
    // Leggi il .env
    const envContent = await readFile(ENV_FILE_PATH, 'utf-8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        envVars[match[1].trim()] = match[2].trim();
      }
    });

    // Genera il Caddyfile
    const caddyfile = `{
    # Abilita logging basilare
    # auto_https on
}

${envVars.APP_DOMAIN ? `{$${envVars.APP_DOMAIN}} {
    encode zstd gzip
    root * /var/www/gestionale/public
    php_fastcgi php:9000
    file_server
}` : ''}

${envVars.BOT_DOMAIN ? `{$${envVars.BOT_DOMAIN}} {
    reverse_proxy bot:3000
}` : ''}

${envVars.N8N_DOMAIN ? `{$${envVars.N8N_DOMAIN}} {
    reverse_proxy n8n:5678
}` : ''}

${envVars.PANEL_DOMAIN ? `{$${envVars.PANEL_DOMAIN}} {
    reverse_proxy panel:4000
}` : ''}

# Nota: in ambienti locali senza DNS pubblico è possibile disabilitare TLS automatico
# aggiungendo la direttiva \`auto_https off\` nel blocco globale e usando hostnames
# come :80 o domini risolti nel /etc/hosts.
`;

    // Salva il Caddyfile
    await writeFile(CADDYFILE_PATH, caddyfile, 'utf-8');
    
    // Riavvia Caddy per applicare le modifiche
    await execPromise('cd /srv/stack/infra-deploy && docker compose restart caddy');
    
    return true;
  } catch (e) {
    throw new Error('Errore nella rigenerazione Caddyfile: ' + String(e));
  }
}

// Rotte per upload gestionale
app.get('/upload', (req, res) => {
  const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Upload Gestionale - VPS Admin Panel</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  </head>
  <body class="bg-light">
    <div class="container py-4">
      <div class="mb-3">
        <a href="/" class="btn btn-outline-secondary">← Torna alla Dashboard</a>
      </div>
      <h1 class="mb-4">Upload Gestionale</h1>
      <div class="alert alert-info">
        <strong>Istruzioni:</strong> Carica un file ZIP contenente il gestionale PHP. Il file verrà estratto in <code>/srv/stack/gestionale</code>.
        <br><strong>Attenzione:</strong> Il contenuto verrà sovrascritto se la directory esiste già. Si consiglia di fare un backup prima.
      </div>
      <form id="uploadForm" enctype="multipart/form-data">
        <div class="mb-3">
          <label for="zipFile" class="form-label">File ZIP del Gestionale</label>
          <input type="file" class="form-control" id="zipFile" name="zipfile" accept=".zip" required>
          <div class="form-text">Dimensione massima: 500MB. Formato supportato: ZIP</div>
        </div>
        <div class="mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="backupCheck" checked>
            <label class="form-check-label" for="backupCheck">
              Crea backup della directory esistente (se presente)
            </label>
          </div>
        </div>
        <button type="submit" class="btn btn-primary" id="uploadBtn">Carica e Estrai</button>
        <div id="progress" class="mt-3" style="display: none;">
          <div class="progress">
            <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 100%"></div>
          </div>
          <p class="mt-2">Upload in corso...</p>
        </div>
        <div id="message" class="mt-3"></div>
      </form>
    </div>
    <script>
      const form = document.getElementById('uploadForm');
      const messageDiv = document.getElementById('message');
      const progressDiv = document.getElementById('progress');
      const uploadBtn = document.getElementById('uploadBtn');
      
      function showMessage(text, type = 'info') {
        messageDiv.innerHTML = '<div class="alert alert-' + type + ' alert-dismissible fade show" role="alert">' +
          text.replace(/\\n/g, '<br>') + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
      }
      
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        const fileInput = document.getElementById('zipFile');
        const backupCheck = document.getElementById('backupCheck').checked;
        
        if (!fileInput.files[0]) {
          showMessage('Seleziona un file ZIP', 'danger');
          return;
        }
        
        formData.append('zipfile', fileInput.files[0]);
        formData.append('backup', backupCheck);
        
        uploadBtn.disabled = true;
        progressDiv.style.display = 'block';
        messageDiv.innerHTML = '';
        
        try {
          const res = await fetch('/upload', {
            method: 'POST',
            body: formData
          });
          
          const result = await res.json();
          progressDiv.style.display = 'none';
          uploadBtn.disabled = false;
          
          if (result.success) {
            showMessage('Gestionale caricato ed estratto con successo!<br>' + (result.message || ''), 'success');
          } else {
            showMessage('Errore: ' + (result.error || 'Errore sconosciuto'), 'danger');
          }
        } catch (err) {
          progressDiv.style.display = 'none';
          uploadBtn.disabled = false;
          showMessage('Errore durante l\\'upload: ' + err.message, 'danger');
        }
      });
    </script>
  </body>
</html>`;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.post('/upload', upload.single('zipfile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nessun file caricato' });
    }

    const zipBuffer = req.file.buffer;
    const createBackup = req.body.backup === 'true';
    const tmpZipPath = '/tmp/gestionale_upload.zip';
    
    // Salva il file ZIP temporaneo
    await writeFile(tmpZipPath, zipBuffer);
    
    // Crea backup se richiesto
    if (createBackup && existsSync(GESTIONALE_PATH)) {
      const backupPath = `${GESTIONALE_PATH}_backup_${Date.now()}`;
      await execPromise(`mv ${GESTIONALE_PATH} ${backupPath}`);
    }
    
    // Crea la directory se non esiste
    if (!existsSync(GESTIONALE_PATH)) {
      mkdirSync(GESTIONALE_PATH, { recursive: true });
    } else {
      // Pulisci la directory esistente
      await execPromise(`rm -rf ${GESTIONALE_PATH}/*`);
    }
    
    // Estrai il file ZIP
    const extractResult = await execPromise(`cd ${GESTIONALE_PATH} && unzip -q -o ${tmpZipPath}`);
    
    // Rimuovi il file temporaneo
    await execPromise(`rm -f ${tmpZipPath}`);
    
    // Imposta i permessi corretti
    await execPromise(`chown -R 33:33 ${GESTIONALE_PATH} || true`); // 33 è l'uid di www-data
    
    res.json({
      success: true,
      message: `Gestionale estratto in ${GESTIONALE_PATH}. Verifica i permessi e la struttura delle directory.`
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: String(e)
    });
  }
});

// Rotte per gestione domini
app.get('/domains', async (req, res) => {
  try {
    let envContent = '';
    if (existsSync(ENV_FILE_PATH)) {
      envContent = await readFile(ENV_FILE_PATH, 'utf-8');
    }
    
    // Estrai i domini dal .env
    const domains = {};
    envContent.split('\n').forEach(line => {
      const match = line.match(/^(APP_DOMAIN|BOT_DOMAIN|N8N_DOMAIN|PANEL_DOMAIN)=(.*)$/);
      if (match) {
        domains[match[1]] = match[2].trim();
      }
    });
    
    const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gestione Domini - VPS Admin Panel</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  </head>
  <body class="bg-light">
    <div class="container py-4">
      <div class="mb-3">
        <a href="/" class="btn btn-outline-secondary">← Torna alla Dashboard</a>
      </div>
      <h1 class="mb-4">Gestione Domini</h1>
      <div class="alert alert-info">
        <strong>Importante:</strong> Dopo aver modificato i domini, il Caddyfile verrà rigenerato e Caddy verrà riavviato automaticamente.
        <br>Assicurati che i domini puntino correttamente al tuo server (record DNS A o CNAME).
      </div>
      <form id="domainsForm">
        <div class="row mb-3">
          <div class="col-md-6">
            <label for="appDomain" class="form-label">APP_DOMAIN (Gestionale)</label>
            <input type="text" class="form-control" id="appDomain" name="APP_DOMAIN" value="${(domains.APP_DOMAIN || '').replace(/"/g, '&quot;')}" placeholder="app.unlimitedgo.it">
            <div class="form-text">Dominio principale per il gestionale PHP</div>
          </div>
          <div class="col-md-6">
            <label for="panelDomain" class="form-label">PANEL_DOMAIN</label>
            <input type="text" class="form-control" id="panelDomain" name="PANEL_DOMAIN" value="${(domains.PANEL_DOMAIN || '').replace(/"/g, '&quot;')}" placeholder="panel.unlimitedgo.it">
            <div class="form-text">Dominio per il pannello admin</div>
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-6">
            <label for="botDomain" class="form-label">BOT_DOMAIN</label>
            <input type="text" class="form-control" id="botDomain" name="BOT_DOMAIN" value="${(domains.BOT_DOMAIN || '').replace(/"/g, '&quot;')}" placeholder="bot.unlimitedgo.it">
            <div class="form-text">Dominio per il bot WhatsApp (se abilitato)</div>
          </div>
          <div class="col-md-6">
            <label for="n8nDomain" class="form-label">N8N_DOMAIN</label>
            <input type="text" class="form-control" id="n8nDomain" name="N8N_DOMAIN" value="${(domains.N8N_DOMAIN || '').replace(/"/g, '&quot;')}" placeholder="n8n.unlimitedgo.it">
            <div class="form-text">Dominio per n8n</div>
          </div>
        </div>
        <div class="mb-3">
          <button type="submit" class="btn btn-primary">Salva e Applica Modifiche</button>
          <button type="button" id="cancelBtn" class="btn btn-secondary ms-2">Annulla</button>
        </div>
      </form>
      <div id="message"></div>
    </div>
    <script>
      const form = document.getElementById('domainsForm');
      const messageDiv = document.getElementById('message');
      
      function showMessage(text, type = 'info') {
        messageDiv.innerHTML = '<div class="alert alert-' + type + ' alert-dismissible fade show" role="alert">' +
          text.replace(/\\n/g, '<br>') + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
      }
      
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
          data[key] = value;
        });
        
        try {
          const res = await fetch('/domains', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          
          const result = await res.json();
          if (result.success) {
            showMessage('Domini salvati e Caddyfile rigenerato con successo! Caddy è stato riavviato.', 'success');
          } else {
            showMessage('Errore: ' + (result.error || 'Errore sconosciuto'), 'danger');
          }
        } catch (err) {
          showMessage('Errore durante il salvataggio: ' + err.message, 'danger');
        }
      });
      
      document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = '/';
      });
    </script>
  </body>
</html>`;
  
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).send('Errore nel caricamento: ' + String(e));
  }
});

app.post('/domains', async (req, res) => {
  try {
    const { APP_DOMAIN, BOT_DOMAIN, N8N_DOMAIN, PANEL_DOMAIN } = req.body;
    
    // Leggi il .env esistente
    let envContent = '';
    if (existsSync(ENV_FILE_PATH)) {
      envContent = await readFile(ENV_FILE_PATH, 'utf-8');
    }
    
    // Aggiorna o aggiungi i domini
    const lines = envContent.split('\n');
    const updatedLines = [];
    const found = { APP_DOMAIN: false, BOT_DOMAIN: false, N8N_DOMAIN: false, PANEL_DOMAIN: false };
    
    lines.forEach(line => {
      if (line.match(/^APP_DOMAIN=/)) {
        updatedLines.push(`APP_DOMAIN=${APP_DOMAIN || ''}`);
        found.APP_DOMAIN = true;
      } else if (line.match(/^BOT_DOMAIN=/)) {
        updatedLines.push(`BOT_DOMAIN=${BOT_DOMAIN || ''}`);
        found.BOT_DOMAIN = true;
      } else if (line.match(/^N8N_DOMAIN=/)) {
        updatedLines.push(`N8N_DOMAIN=${N8N_DOMAIN || ''}`);
        found.N8N_DOMAIN = true;
      } else if (line.match(/^PANEL_DOMAIN=/)) {
        updatedLines.push(`PANEL_DOMAIN=${PANEL_DOMAIN || ''}`);
        found.PANEL_DOMAIN = true;
      } else {
        updatedLines.push(line);
      }
    });
    
    // Aggiungi quelli mancanti
    if (!found.APP_DOMAIN) updatedLines.push(`APP_DOMAIN=${APP_DOMAIN || ''}`);
    if (!found.BOT_DOMAIN) updatedLines.push(`BOT_DOMAIN=${BOT_DOMAIN || ''}`);
    if (!found.N8N_DOMAIN) updatedLines.push(`N8N_DOMAIN=${N8N_DOMAIN || ''}`);
    if (!found.PANEL_DOMAIN) updatedLines.push(`PANEL_DOMAIN=${PANEL_DOMAIN || ''}`);
    
    // Salva il .env aggiornato
    await writeFile(ENV_FILE_PATH, updatedLines.join('\n'), 'utf-8');
    
    // Rigenera il Caddyfile
    await regenerateCaddyfile();
    
    res.json({
      success: true,
      message: 'Domini aggiornati e Caddyfile rigenerato'
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: String(e)
    });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`VPS Admin Panel in ascolto su :${PORT}`);
});


