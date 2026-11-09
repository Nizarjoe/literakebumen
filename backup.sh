#!/usr/bin/env bash
# Backup harian LiteraKebumen: database + uploads
# Usage: ./backup.sh [folder-tujuan]   (default: ./backups)
set -euo pipefail
cd "$(dirname "$0")"
DEST="${1:-backups}"
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$DEST/litera-backup-$STAMP.tar.gz"
# checkpoint WAL agar db konsisten
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('data/litera.db');d.exec('PRAGMA wal_checkpoint(TRUNCATE)');d.close()"
tar -czf "$OUT" data/litera.db public/uploads
echo "Backup dibuat: $OUT ($(du -h "$OUT" | cut -f1))"
# simpan 14 backup terakhir
ls -1t "$DEST"/litera-backup-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --
