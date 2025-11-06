# 🔧 Fix Problema Redirect //login

## ⚠️ Problema Identificato

La funzione `redirect()` in `helpers.php` genera URL con doppio slash (`//login`) invece di `/login`, causando problemi di DNS.

**Causa**: Quando `base_path()` restituisce `/` e il path è `/login`, la concatenazione produce `//login`.

## ✅ Soluzione

### 1. Correggi il file helpers.php sulla VPS

```bash
nano /srv/stack/gestionale/helpers.php
```

Trova la funzione `redirect()` (circa riga 273) e sostituisci con:

```php
function redirect($path, $code = 302) {
    $base = base_path();
    
    // Normalizza il path per evitare doppi slash
    $path = ltrim($path, '/');
    
    // Se base è '/' o vuoto, usa solo il path
    if ($base === '/' || empty($base)) {
        $location = '/' . $path;
    } else {
        // Assicura un solo slash tra base e path
        $base = rtrim($base, '/');
        $location = $base . '/' . $path;
    }
    
    header("Location: {$location}", true, $code);
    exit;
}
```

Salva: `Ctrl+X`, `Y`, `Enter`

### 2. Verifica che BASE_PATH sia configurato correttamente

```bash
cat /srv/stack/.env | grep BASE_PATH
```

**In produzione, BASE_PATH dovrebbe essere:**
- `BASE_PATH=/` (o vuoto, che viene interpretato come `/`)

**Se non c'è, aggiungilo:**
```bash
echo "BASE_PATH=/" >> /srv/stack/.env
```

### 3. Riavvia PHP

```bash
cd /srv/stack/infra-deploy
docker compose restart php
```

### 4. Test

```bash
curl -I https://app.unlimitedgo.it
```

Dovresti vedere:
```
Location: /login
```

Invece di:
```
Location: //login
```

## 🔍 Verifica

Dopo la correzione, prova ad accedere a:
- `https://app.unlimitedgo.it`

Dovrebbe reindirizzare correttamente a `/login` senza errori DNS.

## 📋 Script di Diagnostica

Esegui anche lo script di diagnostica completa:

```bash
cd /srv/stack/infra-deploy
git pull origin main
chmod +x scripts/diagnostica_completa_gestionale.sh
./scripts/diagnostica_completa_gestionale.sh
```

