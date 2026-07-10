# URL-SYSTEM-V1

DESOLIC-IT PROJECT 23E785

URL-Shortener für DESOLIC – als gehärteter Docker-Container auf der Synology, öffentlich erreichbar über Cloudflare Tunnel unter `link.desolic.com`, bedienbar rein über die Synology-Container-Manager-GUI.

Für weitere Informationen das Dokument "DESOLIC – LEITFADEN URL SHORTENER" im INTNET aufrufen.

## Konfiguration

Sämtliche Einstellungen erfolgen über Umgebungsvariablen (GUI → Container → Umgebung) bzw. über die `.env`-Datei des `docker compose`-Projekts. Es ist kein Terminal/interaktive Eingabe nötig. Eine vollständige, kommentierte Liste steht in `.env.example`.

Geheimnisse können statt als Klartext-Variable auch als Datei übergeben werden: zum API-Hash existiert die Variante `AUTH_TOKEN_HASH_FILE`, die auf ein Docker-Secret zeigt – im mitgelieferten `docker-compose.yml` wird der Hash automatisch als Secret nach `/run/secrets/auth_token_hash` gemountet und erscheint nicht in `docker inspect` – empfohlen.

## API-Token & URL anlegen

| Schritt | Aktion |
| --- | --- |
| Token erzeugen | `docker run --rm node:22.22.3-slim node -e "const c=require('crypto');const t=c.randomBytes(32).toString('base64url');console.log('API-TOKEN='+t);console.log('AUTH_TOKEN_HASH='+c.createHash('sha256').update(t).digest('hex'))"` |
| Hash hinterlegen | `AUTH_TOKEN_HASH` (oder `AUTH_TOKEN_HASH_FILE`) in der `.env` setzen, Container neu starten |
| URL anlegen | `POST https://link.desolic.com/api/shorten` mit Header `Authorization: Bearer <TOKEN>` und JSON-Body `{"url":"https://…"}` |
| Antwort | `{"slug":"…","shortUrl":"https://link.desolic.com/…"}` |

Wunsch-Slug optional über `"slug":"…"` im Body (nur `A–Z`, `a–z`, `0–9`, max. 64 Zeichen, nicht `api`/`healthz`). Der Aufruf der erzeugten Kurz-URL ist öffentlich – ohne Token.

## Sicherheitsmerkmale

Läuft unprivilegiert (UID 1000), mit `no-new-privileges:true` und `cap_drop: ALL`; read-only Rootfs, `tmpfs /tmp`; Ressourcen-Limits (`mem_limit`, `pids_limit`, `cpus`).

Der Container hängt ausschließlich am geteilten `cloudflare-tunnel`-Netzwerk (`internal: true`, siehe `cloudflared/docker-compose.yml`) und hat keinen direkten Internetzugang; der geteilte, zentrale `cloudflared`-Container ist der einzige Ingress und bridget nach außen. Weitere Apps können sich dem selben Netzwerk anschließen.

API-Token wird ausschließlich als SHA-256-Hash gespeichert und zeitkonstant verglichen; per Docker-Secret übergebbar (nicht in `docker inspect`).

Nur `https`-Redirect-Ziele erlaubt; Loopback-, RFC1918- und Link-local-Adressen (inkl. IPv4-mapped IPv6) werden abgelehnt.

Keine Protokollierung von IP-Adressen, Cookies oder Headern; pro Slug nur ein aggregierter Hit-Zähler.

Strenge Security-Header via Helmet (HSTS, no-referrer, nosniff, frame-deny), `cache-control: no-store` auf allen Redirects; Rate-Limit auf allen Routen.

Kein Host-Port veröffentlicht – ausschließlich ausgehender Cloudflare Tunnel (kein Konflikt mit DSM auf 443/5001, keine Router-Portfreigabe nötig).

Versionsgepinnte Images (`node:22.22.3-slim`, `cloudflare/cloudflared:2026.5.2`); `npm audit --audit-level=high` im Build; atomare Persistenz via SQLite-WAL.

## Build & Start

Einmalig pro Host: geteilten Cloudflare Tunnel starten (legt das
`cloudflare-tunnel`-Netzwerk an, das dieses und weitere Projekte nutzen):

```
cd cloudflared
cp .env.example .env
# CF_TUNNEL_TOKEN eintragen
docker compose up -d
cd ..
```

Danach den Shortener bauen und starten:

```
cp .env.example .env
# AUTH_TOKEN_HASH eintragen
mkdir -p data && chown -R 1000:1000 data
docker compose up -d --build
```

Im Cloudflare Zero Trust Dashboard beim Tunnel den Public Hostname
`link.desolic.com` → `http://url-shortener:3000` hinterlegen. Für weitere Apps
dort einfach zusätzliche Public Hostnames auf `http://<container-name>:<port>`
eintragen, die App am selben `cloudflare-tunnel`-Netz anhängen — fertig.
