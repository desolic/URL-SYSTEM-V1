# Datenschutz – URL-SYSTEM-V1

Kurzdokumentation zur DSGVO-konformen Verarbeitung in der laufenden Container-Instanz des DESOLIC URL-Shorteners auf `link.desolic.com`.

## Verarbeitete Daten

Auf dem Container werden ausschließlich folgende, **nicht personenbezogene** Daten gespeichert:

- Ziel-URL und vergebener Slug
- Erstellungszeitpunkt
- aggregierter Treffer-Zähler je Slug (keine Einzelaufrufe, keine Zeitstempel je Visit)
- SHA-256-Hash des API-Tokens (Konfiguration)

**Nicht erhoben, gespeichert oder geloggt:**

- IP-Adressen der Besucher
- User-Agent oder sonstige Request-Header
- Cookies oder Session-Daten
- Referer
- Einzelaufrufe (kein Zugriffslog)

Die Anwendung deaktiviert das Fastify-Request-Logging explizit (`disableRequestLogging: true`).

## Rechtsgrundlage

Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse) – Betrieb eines internen Kurzlinkdienstes der DESOLIC IT. Der Aufruf erzeugter Kurzlinks ist Bestandteil dieses berechtigten Interesses.

## Logging- und Löschkonzept

- Log-Level: `info` (über `LOG_LEVEL` änderbar). App-Logs enthalten ausschließlich Server-Ereignisse (Start, Stop, Fehler-Stack), **keine personenbezogenen Daten**.
- Log-Ausgabe nach `stdout`; persistente Speicherung erfolgt durch den Docker-Log-Treiber des Hosts. Empfohlene Rotation auf der Synology: `max-size=10m`, `max-file=3` in der Container-Manager-Konfiguration.
- Retention der gespeicherten Kurzlinks: unbegrenzt, manuelle Löschung durch den Administrator direkt in der SQLite-Datenbank.
- Backups: `scripts/backup.sh` erzeugt ein konsistentes `tar.gz` des Datenverzeichnisses; Standard-Retention 14 Backups (`KEEP=14`).

## Drittanbieter-Datenflüsse

**Cloudflare, Inc. (US-Anbieter, Drittlandtransfer)**

`link.desolic.com` wird ausschließlich über einen Cloudflare Tunnel veröffentlicht. Cloudflare verarbeitet beim Aufruf eines Kurzlinks:

- IP-Adresse des Besuchers
- HTTP-Header (inkl. User-Agent)
- aufgerufene URL (`link.desolic.com/<slug>`)

Diese Verarbeitung ist für TLS-Terminierung und Tunnel-Betrieb technisch erforderlich. Mit Cloudflare ist ein Auftragsverarbeitungsvertrag (DPA) inkl. EU-Standardvertragsklauseln abzuschließen – verfügbar unter Cloudflare Dashboard → Notifications → Data Processing Addendum.

**Sonstige Drittanbieter:** keine. Der Container baut keine ausgehenden Verbindungen ins Internet auf; er hängt ausschließlich am geteilten `cloudflare-tunnel`-Netzwerk (`internal: true`), sodass nur der zentrale `cloudflared`-Container Kontakt nach außen aufnimmt.

**Weiterleitungsziele:** Beim Aufruf eines Kurzlinks wird der Browser per HTTP-303 zur hinterlegten Ziel-URL weitergeleitet. Die nachfolgende Datenverarbeitung verantwortet ausschließlich der Betreiber der Zielseite; `Referrer-Policy: no-referrer` verhindert, dass die Kurzlink-URL als Referer weitergegeben wird.

## Hinweis an Nutzer der Kurzlinks

Wer einen `link.desolic.com/<slug>`-Link aufruft, dessen Verbindung wird am Cloudflare-Edge entschlüsselt (TLS-Termination). Auf der DESOLIC-Server-Seite selbst werden **keine personenbezogenen Daten** dieses Aufrufs gespeichert.

Empfehlung: Die Datenschutzerklärung von `desolic.com` sollte einen Abschnitt zu `link.desolic.com` und dem Einsatz von Cloudflare als Auftragsverarbeiter (CDN/Tunnel) enthalten.
