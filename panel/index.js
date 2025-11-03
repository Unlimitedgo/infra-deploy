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
const CADDYFILE_PATH = '/opt/caddy/Caddyfile';

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
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use(requireAuth);

// Aggiungi timeout più lunghi per le richieste
app.use((req, res, next) => {
  req.setTimeout(600000); // 10 minuti
  res.setTimeout(600000);
  next();
});

// Configurazione multer per upload file
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});

function execPromise(command, timeout = 300000) {
  return new Promise((resolve) => {
    const child = exec(command, { timeout }, (error, stdout, stderr) => {
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
        <a href="/ftp" class="btn btn-dark ms-2">Gestisci FTP</a>
        <a href="/env" class="btn btn-secondary ms-2">Configurazione (.env)</a>
        <a href="/phpmyadmin" class="btn btn-warning ms-2 text-dark">phpMyAdmin</a>
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

${envVars.APP_DOMAIN ? `${envVars.APP_DOMAIN} {
    encode zstd gzip
    root * /var/www/gestionale
    
    # Servi i file statici direttamente se esistono (prima di PHP)
    @static {
        path *.css *.js *.jpg *.jpeg *.png *.gif *.svg *.ico *.woff *.woff2 *.ttf *.eot
    }
    handle @static {
        file_server
    }
    
    # Tutto il resto va a PHP
    php_fastcgi php:9000
    try_files {path} {path}/ /index.php?{query}
    file_server
}` : ''}

${envVars.BOT_DOMAIN ? `${envVars.BOT_DOMAIN} {
    reverse_proxy bot:3000
}` : ''}

${envVars.N8N_DOMAIN ? `${envVars.N8N_DOMAIN} {
    reverse_proxy n8n:5678
}` : ''}

${envVars.PANEL_DOMAIN ? `${envVars.PANEL_DOMAIN} {
    reverse_proxy panel:4000
}` : ''}

${envVars.PHPMYADMIN_DOMAIN ? `${envVars.PHPMYADMIN_DOMAIN} {
    ${envVars.PHPMYADMIN_BASIC_AUTH_USER && envVars.PHPMYADMIN_BASIC_AUTH_PASSWORD ? `basicauth {
        ${envVars.PHPMYADMIN_BASIC_AUTH_USER} ${envVars.PHPMYADMIN_BASIC_AUTH_PASSWORD}
    }` : ''}
    reverse_proxy phpmyadmin:80
}` : ''}

# Nota: in ambienti locali senza DNS pubblico è possibile disabilitare TLS automatico
# aggiungendo la direttiva \`auto_https off\` nel blocco globale e usando hostnames
# come :80 o domini risolti nel /etc/hosts.
`;

    // Salva il Caddyfile (montato in /opt/caddy/Caddyfile nel container panel)
    // che corrisponde a ./Caddyfile nella directory del progetto
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
  // Imposta timeout più lungo per questa richiesta
  req.setTimeout(600000); // 10 minuti
  res.setTimeout(600000);
  
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
      await execPromise(`mv ${GESTIONALE_PATH} ${backupPath}`, 60000);
    }
    
    // Crea la directory se non esiste
    if (!existsSync(GESTIONALE_PATH)) {
      mkdirSync(GESTIONALE_PATH, { recursive: true });
    } else {
      // Pulisci la directory esistente
      await execPromise(`rm -rf ${GESTIONALE_PATH}/*`, 60000);
    }
    
    // Estrai il file ZIP con timeout più lungo
    const extractResult = await execPromise(`cd ${GESTIONALE_PATH} && unzip -q -o ${tmpZipPath}`, 600000);
    
    // Rimuovi il file temporaneo
    await execPromise(`rm -f ${tmpZipPath}`, 10000);
    
    // Imposta i permessi corretti
    await execPromise(`chown -R 33:33 ${GESTIONALE_PATH} || true`, 60000); // 33 è l'uid di www-data
    
    if (!res.headersSent) {
      res.json({
        success: true,
        message: `Gestionale estratto in ${GESTIONALE_PATH}. Verifica i permessi e la struttura delle directory.`
      });
    }
  } catch (e) {
    // Assicurati sempre di rispondere con JSON valido
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: String(e)
      });
    }
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
      const match = line.match(/^(APP_DOMAIN|BOT_DOMAIN|N8N_DOMAIN|PANEL_DOMAIN|PHPMYADMIN_DOMAIN)=(.*)$/);
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
        <div class="row mb-3">
          <div class="col-md-6">
            <label for="phpmyadminDomain" class="form-label">PHPMYADMIN_DOMAIN</label>
            <input type="text" class="form-control" id="phpmyadminDomain" name="PHPMYADMIN_DOMAIN" value="${(domains.PHPMYADMIN_DOMAIN || '').replace(/"/g, '&quot;')}" placeholder="phpmyadmin.unlimitedgo.it">
            <div class="form-text">Dominio per phpMyAdmin (opzionale)</div>
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
    const { APP_DOMAIN, BOT_DOMAIN, N8N_DOMAIN, PANEL_DOMAIN, PHPMYADMIN_DOMAIN } = req.body;
    
    // Leggi il .env esistente
    let envContent = '';
    if (existsSync(ENV_FILE_PATH)) {
      envContent = await readFile(ENV_FILE_PATH, 'utf-8');
    }
    
    // Aggiorna o aggiungi i domini
    const lines = envContent.split('\n');
    const updatedLines = [];
    const found = { APP_DOMAIN: false, BOT_DOMAIN: false, N8N_DOMAIN: false, PANEL_DOMAIN: false, PHPMYADMIN_DOMAIN: false };
    
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
      } else if (line.match(/^PHPMYADMIN_DOMAIN=/)) {
        updatedLines.push(`PHPMYADMIN_DOMAIN=${PHPMYADMIN_DOMAIN || ''}`);
        found.PHPMYADMIN_DOMAIN = true;
      } else {
        updatedLines.push(line);
      }
    });
    
    // Aggiungi quelli mancanti
    if (!found.APP_DOMAIN) updatedLines.push(`APP_DOMAIN=${APP_DOMAIN || ''}`);
    if (!found.BOT_DOMAIN) updatedLines.push(`BOT_DOMAIN=${BOT_DOMAIN || ''}`);
    if (!found.N8N_DOMAIN) updatedLines.push(`N8N_DOMAIN=${N8N_DOMAIN || ''}`);
    if (!found.PANEL_DOMAIN) updatedLines.push(`PANEL_DOMAIN=${PANEL_DOMAIN || ''}`);
    if (!found.PHPMYADMIN_DOMAIN && PHPMYADMIN_DOMAIN) updatedLines.push(`PHPMYADMIN_DOMAIN=${PHPMYADMIN_DOMAIN || ''}`);
    
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

// Rotte per phpMyAdmin
app.get('/phpmyadmin', async (req, res) => {
  try {
    // Leggi il .env per ottenere il dominio di phpMyAdmin
    let envContent = '';
    if (existsSync(ENV_FILE_PATH)) {
      envContent = await readFile(ENV_FILE_PATH, 'utf-8');
    }
    
    const envVars = {};
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        envVars[match[1].trim()] = match[2].trim();
      }
    });
    
    const phpmyadminDomain = envVars.PHPMYADMIN_DOMAIN;
    const phpmyadminUrl = phpmyadminDomain ? `https://${phpmyadminDomain}` : null;
    
    const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>phpMyAdmin - VPS Admin Panel</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
    <style>
      iframe { border: none; width: 100%; height: calc(100vh - 100px); }
    </style>
  </head>
  <body class="bg-light">
    <div class="container-fluid py-3">
      <div class="mb-3">
        <a href="/" class="btn btn-outline-secondary">← Torna alla Dashboard</a>
        ${phpmyadminUrl ? `<a href="${phpmyadminUrl}" target="_blank" class="btn btn-primary ms-2">Apri in nuova scheda</a>` : ''}
      </div>
      ${phpmyadminUrl ? `
      <iframe src="${phpmyadminUrl}" title="phpMyAdmin"></iframe>
      ` : `
      <div class="alert alert-warning">
        <h4>phpMyAdmin non configurato</h4>
        <p>Per accedere a phpMyAdmin, configura il dominio <code>PHPMYADMIN_DOMAIN</code> nella sezione <a href="/domains">Gestisci Domini</a>.</p>
        <p>Oppure accedi direttamente via IP e porta (non consigliato per produzione).</p>
      </div>
      `}
    </div>
  </body>
</html>`;
  
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).send('Errore: ' + String(e));
  }
});

// Funzione helper per ottenere lista utenti FTP (utenti con shell /bin/bash o /usr/sbin/nologin ma con accesso a /srv/stack)
async function getFtpUsers() {
  try {
    const result = await execPromise('getent passwd | grep -E "(/bin/(bash|sh)|/usr/sbin/nologin)" | cut -d: -f1,3,4,6', 10000);
    const lines = result.stdout.split('\n').filter(l => l.trim());
    const users = [];
    
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 4) {
        const username = parts[0];
        const uid = parts[1];
        const gid = parts[2];
        const home = parts[3];
        
        // Controlla se l'utente ha accesso a /srv/stack o è nel gruppo www-data
        const groupResult = await execPromise(`groups ${username} 2>/dev/null || echo ""`, 5000);
        const inWwwData = groupResult.stdout.includes('www-data');
        const hasAccess = home.includes('/srv/stack') || inWwwData;
        
        if (hasAccess || uid >= 1000) { // Solo utenti normali (non di sistema)
          users.push({
            username,
            uid,
            gid,
            home,
            groups: groupResult.stdout.trim(),
            inWwwData
          });
        }
      }
    }
    
    return users;
  } catch (e) {
    return [];
  }
}

// Rotte per gestione FTP
app.get('/ftp', requireAuth, async (req, res) => {
  try {
    const users = await getFtpUsers();
    
    // Ottieni l'IP del server
    let serverIp = '136.144.242.149'; // IP di default
    try {
      const ipResult = await execPromise("hostname -I | awk '{print $1}' || ip route get 8.8.8.8 | awk '{print $7}' | head -1", 5000);
      if (ipResult.stdout.trim()) {
        serverIp = ipResult.stdout.trim();
      }
    } catch (e) {
      // Usa IP di default se non riusciamo a ottenerlo
    }
    
    const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gestione FTP - VPS Admin Panel</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
    <style>
      .user-card { margin-bottom: 1rem; }
      .password-input { font-family: monospace; }
      .credentials-box {
        background: #f8f9fa;
        border: 2px solid #dee2e6;
        border-radius: 0.375rem;
        padding: 1rem;
        font-family: monospace;
        font-size: 0.9rem;
      }
      .credentials-box code {
        background: #fff;
        padding: 0.2rem 0.4rem;
        border-radius: 0.25rem;
        color: #d63384;
        font-weight: bold;
      }
    </style>
  </head>
  <body class="bg-light">
    <div class="container py-4">
      <div class="mb-3">
        <a href="/" class="btn btn-outline-secondary">← Torna alla Dashboard</a>
      </div>
      <h1 class="mb-4">Gestione Utenti FTP</h1>
      
      <div class="alert alert-info">
        <strong>Info:</strong> Gli utenti FTP hanno accesso alla cartella <code>/srv/stack/gestionale</code>.
        <br>Assicurati di utilizzare password sicure per gli utenti FTP.
      </div>

      <!-- Riquadro Credenziali FTP -->
      <div class="card mb-4 border-primary">
        <div class="card-header bg-primary text-white">
          <h5 class="mb-0">📡 Credenziali di Connessione FTP</h5>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-6 mb-3">
              <h6 class="fw-bold">Connessione FTP Standard:</h6>
              <div class="credentials-box">
                <strong>Host:</strong> <code>${serverIp}</code><br>
                <strong>Porta:</strong> <code>21</code><br>
                <strong>Protocollo:</strong> <code>FTP</code><br>
                <strong>Modalità:</strong> <code>Attiva</code> o <code>Passiva</code><br>
                <strong>Cartella remota:</strong> <code>/srv/stack/gestionale</code>
              </div>
            </div>
            <div class="col-md-6 mb-3">
              <h6 class="fw-bold">Connessione SFTP (Via SSH - Consigliato):</h6>
              <div class="credentials-box">
                <strong>Host:</strong> <code>${serverIp}</code><br>
                <strong>Porta:</strong> <code>22</code><br>
                <strong>Protocollo:</strong> <code>SFTP</code><br>
                <strong>Username:</strong> <code>nome_utente_ftp</code><br>
                <strong>Password:</strong> <code>password_utente</code><br>
                <strong>Cartella remota:</strong> <code>/srv/stack/gestionale</code>
              </div>
            </div>
          </div>
          <div class="alert alert-warning mb-0 mt-3">
            <strong>💡 Nota:</strong> Per accedere a <code>/srv/stack/gestionale</code>, assicurati che l'utente FTP sia nel gruppo <code>www-data</code>. 
            Gli utenti mostrati sotto con ⚠ potrebbero non avere i permessi corretti. Usa il pulsante "Aggiungi a www-data" se necessario.
          </div>
        </div>
      </div>

      <!-- Form per creare nuovo utente -->
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Crea Nuovo Utente FTP</h5>
        </div>
        <div class="card-body">
          <form id="createUserForm">
            <div class="row">
              <div class="col-md-4 mb-3">
                <label for="newUsername" class="form-label">Nome Utente</label>
                <input type="text" class="form-control" id="newUsername" name="username" required pattern="[a-z0-9_-]+" title="Solo lettere minuscole, numeri, underscore e trattini">
                <div class="form-text">Solo lettere minuscole, numeri, underscore e trattini</div>
              </div>
              <div class="col-md-4 mb-3">
                <label for="newPassword" class="form-label">Password</label>
                <input type="password" class="form-control password-input" id="newPassword" name="password" required minlength="8">
                <div class="form-text">Minimo 8 caratteri</div>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">&nbsp;</label>
                <button type="submit" class="btn btn-success w-100">Crea Utente</button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- Lista utenti esistenti -->
      <h2 class="mb-3">Utenti FTP Esistenti</h2>
      <div id="usersList">
        <div class="text-center py-4">
          <div class="spinner-border" role="status">
            <span class="visually-hidden">Caricamento...</span>
          </div>
        </div>
      </div>
    </div>

    <script>
      // Carica lista utenti
      async function loadUsers() {
        try {
          const res = await fetch('/ftp/api/list');
          const data = await res.json();
          const container = document.getElementById('usersList');
          
          if (data.error) {
            container.innerHTML = '<div class="alert alert-danger">Errore: ' + data.error + '</div>';
            return;
          }
          
          if (!data.users || data.users.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nessun utente FTP configurato.</div>';
            return;
          }
          
          container.innerHTML = data.users.map(user => {
            const hasWwwData = user.inWwwData || user.groups.includes('www-data');
            return \`<div class="card user-card">
              <div class="card-body">
                <div class="row align-items-center">
                  <div class="col-md-3">
                    <h5 class="mb-0">\${escapeHtml(user.username)}</h5>
                    <small class="text-muted">UID: \${user.uid} | GID: \${user.gid}</small>
                    <br><small class="text-muted">Home: \${escapeHtml(user.home)}</small>
                    <br><small class="\${hasWwwData ? 'text-success' : 'text-warning'}">
                      \${hasWwwData ? '✓ Nel gruppo www-data' : '⚠ Non nel gruppo www-data'}
                    </small>
                  </div>
                  <div class="col-md-4">
                    <form class="change-password-form" data-username="\${user.username}">
                      <div class="input-group">
                        <input type="password" class="form-control password-input" placeholder="Nuova password" required minlength="8">
                        <button type="submit" class="btn btn-sm btn-warning">Cambia Password</button>
                      </div>
                    </form>
                  </div>
                  <div class="col-md-3">
                    <button class="btn btn-sm btn-danger delete-user" data-username="\${user.username}">Elimina Utente</button>
                  </div>
                  <div class="col-md-2">
                    \${hasWwwData ? '' : '<button class="btn btn-sm btn-info fix-group" data-username="' + user.username + '">Aggiungi a www-data</button>'}
                  </div>
                </div>
              </div>
            </div>\`;
          }).join('');
          
          // Attach event listeners
          document.querySelectorAll('.change-password-form').forEach(form => {
            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              const username = form.dataset.username;
              const password = form.querySelector('input[type="password"]').value;
              if (!confirm('Vuoi cambiare la password per ' + username + '?')) return;
              
              try {
                const res = await fetch('/ftp/api/update', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username, password })
                });
                const result = await res.json();
                if (result.success) {
                  alert('Password cambiata con successo!');
                  form.querySelector('input[type="password"]').value = '';
                } else {
                  alert('Errore: ' + result.error);
                }
              } catch (err) {
                alert('Errore: ' + err.message);
              }
            });
          });
          
          document.querySelectorAll('.delete-user').forEach(btn => {
            btn.addEventListener('click', async () => {
              const username = btn.dataset.username;
              if (!confirm('ATTENZIONE: Vuoi eliminare l\\'utente ' + username + '? Questa operazione non può essere annullata.')) return;
              
              try {
                const res = await fetch('/ftp/api/delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username })
                });
                const result = await res.json();
                if (result.success) {
                  alert('Utente eliminato con successo!');
                  loadUsers();
                } else {
                  alert('Errore: ' + result.error);
                }
              } catch (err) {
                alert('Errore: ' + err.message);
              }
            });
          });
          
          document.querySelectorAll('.fix-group').forEach(btn => {
            btn.addEventListener('click', async () => {
              const username = btn.dataset.username;
              try {
                const res = await fetch('/ftp/api/fix-group', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username })
                });
                const result = await res.json();
                if (result.success) {
                  alert('Utente aggiunto al gruppo www-data!');
                  loadUsers();
                } else {
                  alert('Errore: ' + result.error);
                }
              } catch (err) {
                alert('Errore: ' + err.message);
              }
            });
          });
        } catch (err) {
          document.getElementById('usersList').innerHTML = '<div class="alert alert-danger">Errore nel caricamento: ' + err.message + '</div>';
        }
      }
      
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
      
      // Form creazione nuovo utente
      document.getElementById('createUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('newUsername').value;
        const password = document.getElementById('newPassword').value;
        
        try {
          const res = await fetch('/ftp/api/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const result = await res.json();
          if (result.success) {
            alert('Utente creato con successo!');
            document.getElementById('createUserForm').reset();
            loadUsers();
          } else {
            alert('Errore: ' + result.error);
          }
        } catch (err) {
          alert('Errore: ' + err.message);
        }
      });
      
      // Carica lista al caricamento pagina
      loadUsers();
    </script>
  </body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).send('Errore: ' + String(e));
  }
});

// API per ottenere lista utenti FTP
app.get('/ftp/api/list', requireAuth, async (req, res) => {
  try {
    const users = await getFtpUsers();
    res.json({ success: true, users });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// API per creare nuovo utente FTP
app.post('/ftp/api/create', requireAuth, express.json(), async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username e password richiesti' });
    }
    
    if (!/^[a-z0-9_-]+$/.test(username)) {
      return res.status(400).json({ success: false, error: 'Username non valido. Usa solo lettere minuscole, numeri, underscore e trattini' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password deve essere di almeno 8 caratteri' });
    }
    
    // Verifica se l'utente esiste già
    const checkUser = await execPromise(`id ${username} 2>&1`, 5000);
    if (checkUser.stdout.includes('uid=')) {
      return res.status(400).json({ success: false, error: 'Utente già esistente' });
    }
    
    // Crea l'utente (richiede sudo)
    // Usa echo per passare la password a chpasswd
    const createUserResult = await execPromise(
      `sudo useradd -m -d /home/${username} -s /bin/bash ${username} 2>&1 && echo "${username}:${password}" | sudo chpasswd 2>&1`,
      10000
    );
    
    if (createUserResult.error && !createUserResult.stdout.includes('already exists')) {
      // Se c'è un errore ma non è "already exists", fallisce
      if (createUserResult.stderr && !createUserResult.stderr.includes('already exists')) {
        throw new Error(createUserResult.stderr || createUserResult.stdout);
      }
    }
    
    // Aggiungi l'utente al gruppo www-data
    await execPromise(`sudo usermod -aG www-data ${username} 2>&1`, 5000);
    
    res.json({ success: true, message: 'Utente creato con successo' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// API per modificare password utente
app.post('/ftp/api/update', requireAuth, express.json(), async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username e password richiesti' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password deve essere di almeno 8 caratteri' });
    }
    
    // Verifica se l'utente esiste
    const checkUser = await execPromise(`id ${username} 2>&1`, 5000);
    if (!checkUser.stdout.includes('uid=')) {
      return res.status(400).json({ success: false, error: 'Utente non trovato' });
    }
    
    // Cambia password (richiede sudo)
    const changePassResult = await execPromise(
      `echo "${username}:${password}" | sudo chpasswd 2>&1`,
      5000
    );
    
    if (changePassResult.error) {
      throw new Error(changePassResult.stderr || changePassResult.stdout);
    }
    
    res.json({ success: true, message: 'Password cambiata con successo' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// API per eliminare utente
app.post('/ftp/api/delete', requireAuth, express.json(), async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username richiesto' });
    }
    
    // Verifica che non sia l'utente corrente o root
    if (username === 'root' || username === process.env.PANEL_USER) {
      return res.status(400).json({ success: false, error: 'Non puoi eliminare questo utente' });
    }
    
    // Elimina utente e home directory (richiede sudo)
    const deleteUserResult = await execPromise(
      `sudo userdel -r ${username} 2>&1`,
      5000
    );
    
    if (deleteUserResult.error && !deleteUserResult.stdout.includes('does not exist')) {
      throw new Error(deleteUserResult.stderr || deleteUserResult.stdout);
    }
    
    res.json({ success: true, message: 'Utente eliminato con successo' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// API per aggiungere utente al gruppo www-data
app.post('/ftp/api/fix-group', requireAuth, express.json(), async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username richiesto' });
    }
    
    // Aggiungi l'utente al gruppo www-data (richiede sudo)
    const addGroupResult = await execPromise(
      `sudo usermod -aG www-data ${username} 2>&1`,
      5000
    );
    
    if (addGroupResult.error) {
      throw new Error(addGroupResult.stderr || addGroupResult.stdout);
    }
    
    res.json({ success: true, message: 'Utente aggiunto al gruppo www-data' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`VPS Admin Panel in ascolto su :${PORT}`);
});


