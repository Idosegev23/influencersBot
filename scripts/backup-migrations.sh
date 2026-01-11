#!/bin/bash
# Backup all Supabase migrations
# Run: ./scripts/backup-migrations.sh

set -e

BACKUP_DIR="./backups/migrations"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/migrations_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "🔄 Backing up Supabase migrations..."

# Check if migrations directory exists
if [ ! -d "./supabase/migrations" ]; then
    echo "❌ Migrations directory not found!"
    exit 1
fi

# Create tarball of migrations
tar -czf "$BACKUP_FILE" \
    supabase/migrations/ \
    supabase/config.toml 2>/dev/null || true

echo "✅ Migrations backup completed: $BACKUP_FILE"
echo "📏 Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Keep only last 50 backups
cd "$BACKUP_DIR"
ls -t migrations_*.tar.gz | tail -n +51 | xargs -r rm

echo "✅ Backup process completed!"

