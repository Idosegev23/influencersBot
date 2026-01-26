#!/bin/bash

# ============================================
# 🚀 סקריפט פשוט להרצת מיגרציות
# ============================================

echo ""
echo "🚀 Supabase Migrations Runner"
echo "======================================"
echo ""

# בדיקה אם Supabase CLI מותקן
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI לא מותקן!"
    echo ""
    echo "📥 להתקנה:"
    echo "   brew install supabase/tap/supabase"
    echo ""
    echo "או השתמש במדריך הידני: HOW_TO_RUN_MIGRATIONS.md"
    exit 1
fi

echo "✅ Supabase CLI מותקן"
echo ""

# בדיקה אם יש חיבור לפרויקט
echo "🔍 בודק חיבור לפרויקט..."
if ! supabase projects list &> /dev/null; then
    echo ""
    echo "⚠️  לא מחובר לפרויקט Supabase"
    echo ""
    echo "📋 כדי להתחבר:"
    echo "   1. supabase login"
    echo "   2. supabase link --project-ref YOUR_PROJECT_REF"
    echo ""
    echo "או השתמש במדריך הידני: HOW_TO_RUN_MIGRATIONS.md"
    exit 1
fi

echo "✅ מחובר לפרויקט"
echo ""

# הצגת רשימת מיגרציות
echo "📋 מיגרציות זמינות:"
echo "   010 - Storage Setup"
echo "   011 - Notification Engine"
echo "   012 - Coupons & ROI"
echo "   014 - Calendar Integration"
echo "   015 - Chatbot Upgrades + Social Listening"
echo "   016 - Copy Tracking (חדש!)"
echo "   017 - Satisfaction Surveys (חדש!)"
echo ""

# שאלה למשתמש
echo "❓ מה תרצה להריץ?"
echo "   1) כל המיגרציות (010-017)"
echo "   2) רק החדשות (016-017)"
echo "   3) יציאה"
echo ""
read -p "בחר אופציה (1/2/3): " choice

case $choice in
    1)
        echo ""
        echo "🚀 מריץ את כל המיגרציות..."
        echo ""
        
        # הרצת כל המיגרציות לפי סדר
        for migration in 010 011 012 014 015 016 017; do
            file="supabase/migrations/${migration}_*.sql"
            if ls $file 1> /dev/null 2>&1; then
                echo "▶️  מריץ מיגרציה $migration..."
                supabase db execute -f $(ls $file | head -1)
                if [ $? -eq 0 ]; then
                    echo "   ✅ הצלחה!"
                else
                    echo "   ❌ שגיאה במיגרציה $migration"
                    exit 1
                fi
            else
                echo "   ⚠️  קובץ $file לא נמצא, מדלג..."
            fi
        done
        ;;
    2)
        echo ""
        echo "🚀 מריץ רק את המיגרציות החדשות..."
        echo ""
        
        for migration in 016 017; do
            file="supabase/migrations/${migration}_*.sql"
            if ls $file 1> /dev/null 2>&1; then
                echo "▶️  מריץ מיגרציה $migration..."
                supabase db execute -f $(ls $file | head -1)
                if [ $? -eq 0 ]; then
                    echo "   ✅ הצלחה!"
                else
                    echo "   ❌ שגיאה במיגרציה $migration"
                    exit 1
                fi
            else
                echo "   ⚠️  קובץ $file לא נמצא"
                exit 1
            fi
        done
        ;;
    3)
        echo "👋 ביי!"
        exit 0
        ;;
    *)
        echo "❌ בחירה לא חוקית"
        exit 1
        ;;
esac

echo ""
echo "🎉 כל המיגרציות הושלמו בהצלחה!"
echo ""
echo "📊 כדי לבדוק:"
echo "   supabase db dump --data-only --schema public"
echo ""
echo "🚀 המערכת מוכנה לשימוש!"
