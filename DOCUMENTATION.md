# DESOLIC URL-System — Dokumentation

URL-Shortener für DESOLIC. Läuft als Docker-Container auf der Synology-NAS und
ist öffentlich über einen Cloudflare Tunnel unter `link.desolic.com` erreichbar.
Die Hauptseite (OVH) und die DNS-Verwaltung bleiben davon unberührt.

---

## 1. Überblick

```
  Besucher ──HTTPS──▶ Cloudflare ──Tunnel──▶ [ cloudflared ] ──▶ [ url-shortener:3000 ]
                                              └──────────── Synology / Docker ──────────┘
```

- **`url-shortener`** — die eigentliche Anwendung (Node.js + Fastify, SQLite).
- **`cloudflared`** — baut eine *ausgehende* Verbindung zu Cloudflare auf und
  veröffentlicht `link.desolic.com`. Es wird **kein** Port auf der NAS geöffnet,
  daher kein Konflikt mit DSM (Port 443/5001) und keine Router-Freigabe nötig.

---

## 2. Funktionsweise

- **URL anlegen:** authentifizierter `POST /api/shorten` → der Server speichert
  die Ziel-URL und vergibt einen kurzen Slug.
- **URL aufrufen:** `GET /<slug>` → `303`-Weiterleitung auf die Ziel-URL.
- **Unbekannter Slug** → Weiterleitung auf `DEFAULT_REDIRECT`.
- **Speicherung:** SQLite-Datei unter `/data/db.sqlite` (im gemounteten Volume).
- **Authentifizierung:** ein gemeinsames Bearer-Token. Der Server speichert nur
  den SHA-256-Hash des Tokens und vergleicht zeitkonstant. Es gibt **kein**
  Login mit Benutzername/Passwort und kein Web-Formular — das Anlegen läuft
  ausschließlich über die API.

---

## 3. Voraussetzungen

- Synology-NAS mit DSM 7.2+ und installiertem **Container Manager**.
- **Cloudflare**-Konto; die Zone `desolic.com` (oder die delegierte Subdomain
  `link`) muss bei Cloudflare verwaltet werden.
- SSH-Zugang zur NAS (für Rechtevergabe und Token-Erzeugung).

---

## 4. Installation — Schritt für Schritt

### Schritt 1 — Projektdateien auf die NAS

Das komplette Repository in einen Ordner auf der NAS legen, z. B.
`/volume1/docker/url-system/`. Der Ordner muss mindestens enthalten:
`docker-compose.yml`, `Dockerfile`, `package.json`, `package-lock.json`, `src/`.

### Schritt 2 — API-Token erzeugen

Per SSH auf der NAS (funktioniert auf jedem Rechner mit Docker):

```
docker run --rm node:22-slim node -e "const c=require('crypto');const t=c.randomBytes(32).toString('base64url');console.log('API-TOKEN       = '+t);console.log('AUTH_TOKEN_HASH = '+c.createHash('sha256').update(t).digest('hex'))"
```

Ausgabe (Beispiel):

```
API-TOKEN       = r8PCm8FXa2baiRvQpIpdoPbilIb345PD6eCpL4p2Fd0
AUTH_TOKEN_HASH = a8c0856eb2dd5e5f848bfc4d74c7563c3c536c97092f3470dae899ca69e4d783
```

- **`API-TOKEN`** — geheim aufbewahren. Damit legst du später URLs an.
- **`AUTH_TOKEN_HASH`** — kommt in Schritt 4 in die `.env`.

> Alternative bei lokal vorhandenem Node + Repo: `npm run gen-token`.

### Schritt 3 — Cloudflare Tunnel anlegen

1. **Cloudflare Zero Trust** Dashboard → **Networks → Tunnels → Create a tunnel**
   → Typ **Cloudflared**.
2. Namen vergeben (z. B. `desolic-link`). Der angezeigte **Tunnel-Token** ist
   der spätere `CF_TUNNEL_TOKEN` → kopieren.
3. Reiter **Public Hostname → Add a public hostname**:
   - **Subdomain:** `link`
   - **Domain:** `desolic.com`
   - **Type:** `HTTP`
   - **URL:** `url-shortener:3000`
4. Speichern. Cloudflare legt den DNS-Eintrag für `link.desolic.com`
   automatisch an.

### Schritt 4 — `.env`-Datei anlegen

Im Projektordner eine Datei `.env` erstellen (**niemals** ins Git committen):

```
AUTH_TOKEN_HASH=<Hash aus Schritt 2>
CF_TUNNEL_TOKEN=<Token aus Schritt 3>
SHORT_DOMAIN=link.desolic.com
DEFAULT_REDIRECT=https://desolic.com/
```

### Schritt 5 — Datenordner anlegen und Rechte setzen

Per SSH:

```
mkdir -p /volume1/docker/url-system/data
chown -R 1000:1000 /volume1/docker/url-system/data
```

> **Wichtig:** Der Container läuft als Benutzer `node` (UID 1000). Ohne diese
> Rechte kann er die SQLite-Datenbank nicht anlegen und stürzt beim Start ab.

### Schritt 6 — Projekt im Container Manager starten

Container Manager → **Projekt → Erstellen**:

- **Projektname:** `url-system`
- **Pfad:** der Projektordner aus Schritt 1
- **Quelle:** vorhandene `docker-compose.yml` verwenden
- **Erstellen** → das Image wird gebaut, beide Container (`url-shortener`,
  `cloudflared`) starten.

### Schritt 7 — Installation prüfen

- Container Manager: beide Container „running", `url-shortener` Status
  **healthy**.
- Browser: `https://link.desolic.com/healthz` → `{"status":"ok"}`.
- Cloudflare-Dashboard: Tunnel-Status **Healthy**.

---

## 5. Eine URL anlegen

`POST` auf `/api/shorten` mit dem API-Token im `Authorization`-Header und der
Ziel-URL im JSON-Body:

```
curl -X POST https://link.desolic.com/api/shorten \
  -H "Authorization: Bearer DEIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.desolic.com/eine/lange/seite"}'
```

Antwort:

```
{"slug":"b","shortUrl":"https://link.desolic.com/b"}
```

**Eigener Wunsch-Slug** (optional):

```
curl -X POST https://link.desolic.com/api/shorten \
  -H "Authorization: Bearer DEIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.desolic.com/angebot","slug":"angebot2026"}'
```

Slug-Regeln: nur `A–Z`, `a–z`, `0–9`, 1–64 Zeichen, nicht `api` oder `healthz`.

**Status-Codes:**

| Code | Bedeutung |
|------|-----------|
| 201  | Kurz-URL angelegt |
| 400  | Ungültige URL (kein `https` / interner Host) oder ungültiger Slug |
| 401  | Token fehlt oder falsch |
| 409  | Wunsch-Slug bereits vergeben |
| 429  | Rate-Limit überschritten (max. 20 Anlegevorgänge pro Minute) |

---

## 6. Eine Kurz-URL benutzen

Einfach im Browser aufrufen: `https://link.desolic.com/b` → Weiterleitung
(`303`) auf die hinterlegte Ziel-URL. Der Aufruf ist **öffentlich** und braucht
kein Token — so funktioniert ein Shortener.

---

## 7. Konfiguration (Umgebungsvariablen)

| Variable          | Pflicht        | Default (Container) | Bedeutung |
|-------------------|----------------|---------------------|-----------|
| `AUTH_TOKEN_HASH` | **ja**         | –                   | SHA-256-Hash des API-Tokens |
| `CF_TUNNEL_TOKEN` | **ja** (compose) | –                 | Cloudflare-Tunnel-Token (nur `cloudflared`) |
| `SHORT_DOMAIN`    | ja             | `link.desolic.com`  | Domain in den erzeugten Kurzlinks |
| `DEFAULT_REDIRECT`| ja             | `https://desolic.com/` | Ziel bei unbekanntem Slug (muss `https`) |
| `PORT`            | nein           | `3000`              | interner Port der App |
| `BIND_ADDRESS`    | nein           | `0.0.0.0`           | Bind-Adresse im Container |
| `DATABASE_PATH`   | nein           | `/data/db.sqlite`   | Pfad der SQLite-Datei |
| `TRUST_PROXY`     | nein           | `true`              | `X-Forwarded-For` des Proxys vertrauen |
| `LOG_LEVEL`       | nein           | `info`              | Log-Ausführlichkeit |

Fehlt eine Pflichtvariable, startet der Container bewusst **nicht**
(„fail closed").

---

## 8. Betrieb

- **Update:** neue Projektdateien einspielen, im Container Manager das Projekt
  neu erstellen/starten — das Image wird neu gebaut.
- **Backup:** den Ordner `data/` sichern. Für ein konsistentes Backup den
  `url-shortener`-Container vorher kurz stoppen (SQLite-WAL-Dateien).
- **Token wechseln:** neuen Token erzeugen (Schritt 2), `AUTH_TOKEN_HASH` in der
  `.env` ersetzen, Container neu starten. Der alte Token wird damit ungültig.
- **Logs:** Container Manager → Protokoll. Es werden **keine** IP-Adressen,
  Cookies oder Header geloggt.

---

## 9. Fehlerbehebung

| Symptom | Ursache / Lösung |
|---------|------------------|
| `url-shortener` startet nicht, Log „Invalid configuration" | `AUTH_TOKEN_HASH` fehlt oder ist ungültig in der `.env` |
| Container crasht beim Start, Log enthält `SQLITE_CANTOPEN` | `data/`-Ordner ist nicht für UID 1000 schreibbar → `chown -R 1000:1000 data` |
| compose-Fehler „... AUTH_TOKEN_HASH ... required" | `.env` fehlt im Projektordner oder Variable ist leer |
| `link.desolic.com` nicht erreichbar | Tunnel-Status im Cloudflare-Dashboard und das `cloudflared`-Container-Log prüfen |
| `cloudflared` läuft, aber Fehler 502 | Public-Hostname-URL muss exakt `url-shortener:3000` sein; beide Container müssen im selben Projekt laufen |
| `401` beim Anlegen einer URL | Falsches API-Token — es muss zum gesetzten `AUTH_TOKEN_HASH` passen |

---

## 10. Sicherheit & Datenschutz

- API-Token wird nur als SHA-256-**Hash** gespeichert, Vergleich zeitkonstant.
- Nur `https`-Ziele erlaubt; interne/private Adressen werden abgelehnt.
- Keine Protokollierung von IP-Adressen, Cookies oder Headern.
- Kein Host-Port geöffnet — ausschließlich ausgehender Cloudflare Tunnel.
- Strenge Security-Header (HSTS, `no-referrer`, …), Rate-Limiting auf allen
  Routen, Container ohne Root-Rechte und ohne zusätzliche Capabilities.
