# 💾 Backup & Restore Guide

## תוכן עניינים
- [למה צריך Backups?](#למה-צריך-backups)
- [אילו Backups יש?](#אילו-backups-יש)
- [איך לעשות Backup?](#איך-לעשות-backup)
- [איך לשחזר?](#איך-לשחזר)
- [Automation](#automation)
- [Best Practices](#best-practices)

---

## למה צריך Backups?

### 🚨 תרחישי סיכון:
1. **טעות אנושית** - מחיקת דאטה בטעות
2. **באג בקוד** - קוד שמוחק/משנה דאטה בטעות
3. **פריצת אבטחה** - ransomware או מחיקה זדונית
4. **כשל בשירות** - Supabase/Vercel down
5. **שחיתות דאטה** - corruption של DB

### ✅ מה Backup מציל:
- 📊 כל הדאטה בבסיס הנתונים
- 🔄 היסטוריית migrations
- 📝 קוד ותיעוד
- ⚙️ הגדרות ו-configuration

---

## אילו Backups יש?

### 1. **Database Backup** (קריטי!)
```bash
npm run backup:db
```
- גיבוי מלא של כל הדאטה
- כולל: partnerships, tasks, invoices, contracts, events, analytics
- פורמט: SQL + Binary dump
- שומר 30 backups אחרונים

### 2. **Migrations Backup** (חשוב!)
```bash
npm run backup:migrations
```
- כל ה-migrations מ-Supabase
- היסטוריית שינויי schema
- שומר 50 backups אחרונים

### 3. **Full Backup** (מומלץ!)
```bash
npm run backup:all
```
- הכל ביחד:
  - קוד מקור
  - migrations
  - תיעוד
  - memory bank
- יוצר ZIP אחד עם הכל
- שומר 10 backups אחרונים

---

## איך לעשות Backup?

### הכנה ראשונית (פעם אחת):

#### 1. התקן PostgreSQL client tools:

**Mac:**
```bash
brew install postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-client
```

**Windows:**
- הורד מ: https://www.postgresql.org/download/windows/

#### 2. קבל פרטי חיבור ל-DB:

מ-Supabase Dashboard → Settings → Database:
```bash
Host: db.xxxxx.supabase.co
Database: postgres
User: postgres
Password: [your password]
```

#### 3. שמור ב-.env.local:
```bash
SUPABASE_DB_HOST=db.xxxxx.supabase.co
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your-password-here
```

### הרצת Backup:

#### Backup מהיר (קוד + migrations):
```bash
npm run backup:all
```

#### Backup מלא של DB (אם יש pg_dump):
```bash
npm run backup:db
```

#### Backup רק של migrations:
```bash
npm run backup:migrations
```

### איפה הקבצים נשמרים?
```
backups/
├── database/          # DB dumps
├── migrations/        # Migration archives
└── full_backup_*/     # Complete backups
```

---

## איך לשחזר?

### 1. שחזור Database מלא:

```bash
# Extract backup
gunzip backups/database/backup_TIMESTAMP.sql.gz

# Restore to Supabase
PGPASSWORD="your-password" psql \
  -h db.xxxxx.supabase.co \
  -U postgres \
  -d postgres \
  -f backups/database/backup_TIMESTAMP.sql
```

**⚠️ אזהרה:** זה ימחק את הדאטה הנוכחית!

### 2. שחזור Migrations בלבד:

```bash
# Extract
tar -xzf backups/migrations/migrations_TIMESTAMP.tar.gz

# Apply to new Supabase project
cd supabase
supabase db reset
```

### 3. שחזור פרויקט מלא:

```bash
# Extract full backup
cd backups
unzip full_backup_TIMESTAMP.zip
cd full_backup_TIMESTAMP

# Extract all components
tar -xzf code.tar.gz
tar -xzf migrations.tar.gz
tar -xzf docs.tar.gz

# Install dependencies
npm install

# Setup environment
cp env.example .env.local
# Edit .env.local with your secrets

# Apply migrations
# (copy migrations to supabase/migrations/ and run reset)

# Build
npm run build
```

---

## Automation

### Git Hook (אוטומטי לפני commit):

הוסף ל-`.git/hooks/pre-commit`:
```bash
#!/bin/bash
npm run precommit || exit 1
```

זה יבדוק:
- ✅ TypeScript errors
- ✅ Linting
- ✅ Build success
- ✅ No sensitive data

### Cron Job לbackup יומי:

**Mac/Linux:**
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/influencerbot && npm run backup:all

# Add weekly full DB backup (Sundays at 3 AM)
0 3 * * 0 cd /path/to/influencerbot && npm run backup:db
```

### GitHub Actions (אוטומטי):

צור `.github/workflows/backup.yml`:
```yaml
name: Weekly Backup
on:
  schedule:
    - cron: '0 0 * * 0'  # Sunday midnight
  workflow_dispatch:      # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run backup:all
      - uses: actions/upload-artifact@v3
        with:
          name: backup
          path: backups/full_backup_*.zip
```

---

## Best Practices

### ✅ מה לעשות:

1. **Backup לפני כל דיפלוי גדול**
   ```bash
   npm run backup:all
   git add -A
   git commit -m "..."
   git push
   ```

2. **Backup שבועי אוטומטי** (cron או GitHub Actions)

3. **העלאה ל-cloud storage**
   ```bash
   # AWS S3
   aws s3 cp backups/full_backup_*.zip s3://my-backups/

   # Google Drive (with rclone)
   rclone copy backups/ gdrive:/backups/influencerbot/
   ```

4. **בדיקת backup** (פעם בחודש)
   - נסה לשחזר בסביבת dev
   - וודא שהדאטה תקינה

5. **שמור multiple copies**
   - Local (backups/)
   - Cloud (S3/Google Drive)
   - External drive

### ❌ מה לא לעשות:

1. **אל תשמור backups רק לוקאלית**
   - אם המחשב נשרף, הכל אבוד

2. **אל תשמור .env בbackup**
   - סודות לא צריכים להיות ב-backup

3. **אל תסמוך רק על Supabase**
   - גם שירותים גדולים נופלים

4. **אל תשכח לבדוק backups**
   - backup שלא נבדק = לא backup

---

## Troubleshooting

### "pg_dump: command not found"
```bash
# Mac
brew install postgresql

# Ubuntu
sudo apt-get install postgresql-client
```

### "permission denied: ./scripts/backup.sh"
```bash
chmod +x scripts/*.sh
```

### "FATAL: password authentication failed"
- בדוק שה-password ב-.env.local נכון
- קבל password חדש מ-Supabase Dashboard

### Backup גדול מדי?
```bash
# Backup רק טבלאות ספציפיות:
pg_dump -t partnerships -t tasks ... > backup.sql

# דחיסה חזקה יותר:
gzip -9 backup.sql
```

---

## 🆘 Emergency Recovery

### אם הכל נפל:

1. **אל תיבהל** 🧘‍♂️

2. **מצא את ה-backup האחרון:**
   ```bash
   ls -lt backups/full_backup_*.zip | head -1
   ```

3. **שחזר לפרויקט חדש:**
   ```bash
   mkdir influencerbot-recovery
   cd influencerbot-recovery
   unzip ../backups/full_backup_TIMESTAMP.zip
   # Follow restore steps above
   ```

4. **צור Supabase פרויקט חדש**

5. **Apply migrations:**
   ```bash
   # Copy migrations
   cp -r migrations/* supabase/migrations/
   supabase db reset
   ```

6. **Deploy לVercel חדש**
   ```bash
   vercel deploy
   ```

---

## 📞 תמיכה

אם משהו לא עובד:
1. בדוק את MANIFEST.txt בתוך ה-backup
2. ודא שיש לך את כל הסודות ב-.env.local
3. נסה לשחזר בsandbox לפני production

**זכור:** Backup טוב = שינה טובה בלילה! 😴✅

