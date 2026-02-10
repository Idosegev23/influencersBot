#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
בדיקה מינימלית של instaloader - רק מידע פומבי בסיסי
"""

import instaloader
import json
import time

PROFILE_NAME = "miranbuzaglo"

def main():
    print("🔍 מנסה לקרוא מידע בסיסי על הפרופיל...")
    
    # יצירת instance פשוט עם rate limiting נמוך
    L = instaloader.Instaloader(
        quiet=False,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        max_connection_attempts=1,
    )
    
    # המתנה קצרה לפני הבקשה
    time.sleep(3)
    
    try:
        print(f"📱 מנסה לטעון פרופיל {PROFILE_NAME}...")
        profile = instaloader.Profile.from_username(L.context, PROFILE_NAME)
        
        print("\n✅ הצלחה! מידע פומבי על הפרופיל:\n")
        print("="*60)
        print(f"👤 שם משתמש: @{profile.username}")
        print(f"📝 שם מלא: {profile.full_name}")
        print(f"✓ מאומת: {'כן ✓' if profile.is_verified else 'לא'}")
        print(f"🔒 פרטי: {'כן' if profile.is_private else 'לא'}")
        print(f"\n👥 עוקבים: {profile.followers:,}")
        print(f"👤 עוקב אחרי: {profile.followees:,}")
        print(f"📸 פוסטים: {profile.mediacount:,}")
        
        print(f"\n📝 ביו:")
        print(f"{profile.biography}")
        
        if profile.external_url:
            print(f"\n🔗 קישור חיצוני: {profile.external_url}")
        
        if profile.external_url_linkshimmed:
            print(f"🔗 קישור מלא: {profile.external_url_linkshimmed}")
            
        print("\n📊 מידע טכני:")
        print(f"User ID: {profile.userid}")
        print(f"Business Category: {profile.business_category_name if hasattr(profile, 'business_category_name') else 'N/A'}")
        print(f"Is Business: {'כן' if profile.is_business_account else 'לא'}")
        
        if hasattr(profile, 'biography_mentions'):
            if profile.biography_mentions:
                print(f"\n👥 אזכורים בביו: {', '.join(['@' + m for m in profile.biography_mentions])}")
        
        if hasattr(profile, 'biography_hashtags'):
            if profile.biography_hashtags:
                print(f"#️⃣ האשטאגים בביו: {', '.join(['#' + h for h in profile.biography_hashtags])}")
        
        print("\n📷 תמונת פרופיל:")
        print(f"URL: {profile.profile_pic_url}")
        
        print("="*60)
        
        # שמירה לקובץ JSON
        data = {
            "username": profile.username,
            "full_name": profile.full_name,
            "biography": profile.biography,
            "external_url": profile.external_url,
            "followers": profile.followers,
            "followees": profile.followees,
            "mediacount": profile.mediacount,
            "is_verified": profile.is_verified,
            "is_private": profile.is_private,
            "is_business": profile.is_business_account,
            "userid": profile.userid,
            "profile_pic_url": profile.profile_pic_url,
        }
        
        output_file = f"{PROFILE_NAME}_basic_info.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"\n💾 מידע נשמר ב: {output_file}")
        
        print("\n💡 למידע נוסף (סטוריז, היילייטס, פוסטים):")
        print(f"   python3 scripts/test-instaloader-with-login.py")
        
    except instaloader.exceptions.ProfileNotExistsException:
        print(f"❌ הפרופיל {PROFILE_NAME} לא קיים")
    except instaloader.exceptions.ConnectionException as e:
        print(f"❌ שגיאת חיבור: {str(e)}")
        print("\n💡 אופציות:")
        print("1. המתן 5-10 דקות ונסה שוב")
        print("2. השתמש בסקריפט עם התחברות:")
        print("   python3 scripts/test-instaloader-with-login.py")
    except Exception as e:
        print(f"❌ שגיאה: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
