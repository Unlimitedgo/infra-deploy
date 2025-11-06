# 🔧 Fix CSS Non Carica - ERR_NAME_NOT_RESOLVED

## ⚠️ Problema
Il CSS non si carica e la console del browser mostra: `Failed to load resource: net::ERR_NAME_NOT_RESOLVED`

## 🔍 Causa
La funzione `url()` in `helpers.php` genera URL errati per i file statici (CSS/JS), causando errori di risoluzione DNS.

## ✅ Soluzione

### 1. Correggi la funzione `url()` sulla VPS

```bash
nano /srv/stack/gestionale/helpers.php
```

Trova la funzione `url()` (circa riga 292) e sostituisci con:

```php
function url($path = '') {
    $base = base_path();
    
    // Normalizza il path
    $path = ltrim($path, '/');
    
    // Se base è '/' o vuoto, usa solo il path
    if ($base === '/' || empty($base)) {
        return '/' . $path;
    } else {
        // Assicura un solo slash tra base e path
        $base = rtrim($base, '/');
        return $base . '/' . $path;
    }
}
```

Salva: `Ctrl+X`, `Y`, `Enter`

### 2. Correggi anche `absolute_url()` (opzionale ma consigliato)

Trova la funzione `absolute_url()` (circa riga 308) e sostituisci con:

```php
function absolute_url($path = '') {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $base = base_path();
    
    // Normalizza il path
    $path = ltrim($path, '/');
    
    // Se base è '/' o vuoto, usa solo il path
    if ($base === '/' || empty($base)) {
        $fullPath = '/' . $path;
    } else {
        // Assicura un solo slash tra base e path
        $base = rtrim($base, '/');
        $fullPath = $base . '/' . $path;
    }
    
    return $protocol . '://' . $host . $fullPath;
}
```

### 3. Verifica che BASE_PATH sia configurato

```bash
cat /srv/stack/.env | grep BASE_PATH
```

**In produzione, BASE_PATH dovrebbe essere:**
- `BASE_PATH=/` (o vuoto, che viene interpretato come `/`)

**Se non c'è, aggiungilo:**
```bash
echo "BASE_PATH=/" >> /srv/stack/.env
```

### 4. Riavvia PHP

```bash
cd /srv/stack/infra-deploy
docker compose restart php
```

### 5. Pulisci cache browser

- Pulisci la cache del browser (Ctrl+Shift+Delete)
- Oppure prova in modalità incognito
- Oppure premi Ctrl+F5 per ricaricare forzato

## 🔍 Verifica

Dopo la correzione, apri la console del browser (F12) e verifica che:
- Gli URL CSS siano corretti: `https://app.unlimitedgo.it/public/assets/app.css`
- Non ci siano più errori `ERR_NAME_NOT_RESOLVED`
- Il CSS si carichi correttamente

## 📋 Test

```bash
# Verifica che il file CSS esista
ls -lh /srv/stack/gestionale/public/assets/app.css

# Test accesso diretto al CSS
curl -I https://app.unlimitedgo.it/public/assets/app.css
```

Dovresti vedere `HTTP/2 200` invece di un errore.

