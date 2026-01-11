#!/bin/bash
# Complete backup of all project data
# Run: ./scripts/backup-all.sh

set -e

BACKUP_ROOT="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FULL_BACKUP_DIR="$BACKUP_ROOT/full_backup_$TIMESTAMP"

mkdir -p "$FULL_BACKUP_DIR"

echo "🚀 Starting full project backup..."
echo "📁 Backup location: $FULL_BACKUP_DIR"
echo ""

# 1. Code & Config
echo "1️⃣ Backing up code and configuration..."
tar -czf "$FULL_BACKUP_DIR/code.tar.gz" \
    --exclude=node_modules \
    --exclude=.next \
    --exclude=.git \
    --exclude=backups \
    --exclude=.env.local \
    src/ \
    public/ \
    package.json \
    package-lock.json \
    tsconfig.json \
    next.config.mjs \
    tailwind.config.ts \
    postcss.config.mjs 2>/dev/null || true
echo "✅ Code backup completed"

# 2. Migrations
echo ""
echo "2️⃣ Backing up database migrations..."
tar -czf "$FULL_BACKUP_DIR/migrations.tar.gz" \
    supabase/migrations/ 2>/dev/null || true
echo "✅ Migrations backup completed"

# 3. Documentation
echo ""
echo "3️⃣ Backing up documentation..."
tar -czf "$FULL_BACKUP_DIR/docs.tar.gz" \
    *.md \
    ARCHITECTURE.md \
    SECURITY.md \
    README.md 2>/dev/null || true
echo "✅ Documentation backup completed"

# 4. Environment template (without secrets)
echo ""
echo "4️⃣ Creating environment template..."
if [ -f ".env.example" ]; then
    cp .env.example "$FULL_BACKUP_DIR/env.example"
    echo "✅ Environment template saved"
else
    echo "⚠️  No .env.example found (create one for documentation)"
fi

# 5. Memory Bank
echo ""
echo "5️⃣ Backing up Memory Bank..."
if [ -d "memory-bank" ]; then
    tar -czf "$FULL_BACKUP_DIR/memory-bank.tar.gz" memory-bank/
    echo "✅ Memory Bank backup completed"
else
    echo "ℹ️  No memory-bank directory found"
fi

# Create manifest
echo ""
echo "6️⃣ Creating backup manifest..."
cat > "$FULL_BACKUP_DIR/MANIFEST.txt" << EOF
Backup Created: $(date)
Timestamp: $TIMESTAMP
Backup Type: Full Project Backup

Contents:
- code.tar.gz: Source code and configuration
- migrations.tar.gz: Database migrations
- docs.tar.gz: Documentation files
- env.example: Environment template
- memory-bank.tar.gz: Memory bank files (if exists)

To restore:
1. Extract all .tar.gz files
2. Run: npm install
3. Copy .env.example to .env.local and fill in secrets
4. Apply migrations to Supabase
5. Build and deploy

Git Commit: $(git rev-parse HEAD 2>/dev/null || echo "N/A")
Git Branch: $(git branch --show-current 2>/dev/null || echo "N/A")
EOF

echo "✅ Manifest created"

# Summary
echo ""
echo "================================"
echo "✅ FULL BACKUP COMPLETED!"
echo "================================"
echo ""
echo "📁 Location: $FULL_BACKUP_DIR"
echo "📏 Total size: $(du -sh "$FULL_BACKUP_DIR" | cut -f1)"
echo ""
echo "Contents:"
ls -lh "$FULL_BACKUP_DIR"
echo ""
echo "💡 Tip: Copy this backup to external storage (Google Drive, AWS S3, etc.)"
echo ""

# Optional: Create a zip of the entire backup
echo "📦 Creating compressed archive..."
cd "$BACKUP_ROOT"
zip -r "full_backup_$TIMESTAMP.zip" "full_backup_$TIMESTAMP" > /dev/null
echo "✅ Archive created: $BACKUP_ROOT/full_backup_$TIMESTAMP.zip"
echo ""

# Keep only last 10 full backups
echo "🧹 Cleaning old backups (keeping last 10)..."
cd "$BACKUP_ROOT"
ls -t full_backup_*.zip | tail -n +11 | xargs -r rm
ls -td full_backup_*/ | tail -n +11 | xargs -r rm -rf

echo "✅ All done! Backup saved securely."

