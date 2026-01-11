#!/bin/bash
# Database Backup Script
# Run: ./scripts/backup-database.sh

set -e

# Configuration
BACKUP_DIR="./backups/database"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "🔄 Starting database backup..."

# Get Supabase connection details
# You need to set these in .env or get from Supabase dashboard
DB_HOST="${SUPABASE_DB_HOST:-db.your-project.supabase.co}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_PASSWORD="${SUPABASE_DB_PASSWORD}"

# Check if pg_dump is installed
if ! command -v pg_dump &> /dev/null; then
    echo "❌ pg_dump not found. Install PostgreSQL client tools:"
    echo "   Mac: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql-client"
    exit 1
fi

# Backup database
echo "📦 Backing up to: $BACKUP_FILE"
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --verbose \
  --file="$BACKUP_FILE.dump"

# Also create SQL version for easy viewing
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=plain \
  --file="$BACKUP_FILE"

# Compress backups
gzip "$BACKUP_FILE"
echo "✅ Backup completed: $BACKUP_FILE.gz"
echo "✅ Binary backup: $BACKUP_FILE.dump"

# Backup schema only (for documentation)
SCHEMA_FILE="$BACKUP_DIR/schema_$TIMESTAMP.sql"
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --schema-only \
  --file="$SCHEMA_FILE"
gzip "$SCHEMA_FILE"
echo "✅ Schema backup: $SCHEMA_FILE.gz"

# Keep only last 30 backups
echo "🧹 Cleaning old backups (keeping last 30)..."
cd "$BACKUP_DIR"
ls -t backup_*.sql.gz | tail -n +31 | xargs -r rm
ls -t backup_*.dump | tail -n +31 | xargs -r rm
ls -t schema_*.sql.gz | tail -n +31 | xargs -r rm

echo "✅ Backup process completed successfully!"
echo ""
echo "📁 Backup location: $BACKUP_FILE.gz"
echo "📏 Size: $(du -h "$BACKUP_FILE.gz" 2>/dev/null | cut -f1 || echo 'N/A')"

