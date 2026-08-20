#!/bin/sh
# Consistent backup of the url-shortener SQLite database. Briefly stops the
# url-shortener container so the on-disk files are quiescent, copies the data
# directory into a timestamped tarball, then starts the container again.
#
# Designed to run as a scheduled task on the Synology NAS. Override the
# defaults via environment variables:
#   PROJECT_DIR : path of the docker-compose project (default: /volume1/docker/url-system)
#   BACKUP_DIR  : where the tarballs land           (default: $PROJECT_DIR/backups)
#   SERVICE     : compose service to pause          (default: url-shortener)
#   KEEP        : how many backups to retain        (default: 14)

set -eu

PROJECT_DIR="${PROJECT_DIR:-/volume1/docker/url-system}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
SERVICE="${SERVICE:-url-shortener}"
KEEP="${KEEP:-14}"

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$BACKUP_DIR/backup-$STAMP.tar.gz"

echo "Stopping $SERVICE..."
docker compose stop "$SERVICE"

echo "Creating $TARGET..."
tar -czf "$TARGET" data

echo "Starting $SERVICE..."
docker compose start "$SERVICE"

# Retain only the most recent $KEEP backups
ls -1t "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null \
  | tail -n +"$((KEEP + 1))" \
  | xargs -r rm -f --

echo "Backup saved: $TARGET"
