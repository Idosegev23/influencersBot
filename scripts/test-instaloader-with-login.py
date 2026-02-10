#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
סקריפט לבדיקת instaloader על פרופיל אינסטגרם עם התחברות
מטרה: לסרוק פרופיל miranbuzaglo ולאסוף:
- סטורי
- היילייט
- ביו פרופיל
- תמונת פרופיל
- קישורים
- פוסטים (עד 150)
- תגובות (עד 3 לכל פוסט)
"""

import instaloader
import json
from datetime import datetime
import os
import sys
import getpass

# שם הפרופיל לסריקה
PROFILE_NAME = "miranbuzaglo"
MAX_POSTS = 150
MAX_COMMENTS_PER_POST = 3
OUTPUT_DIR = f"instaloader_test_{PROFILE_NAME}"
SESSION_FILE = "instaloader_session"

def login_to_instagram(L, username=None):
    """מנהל התחברות לאינסטגרם"""
    
    # ניסיון לטעון session קיים
    try:
        if username:
            L.load_session_from_file(username, filename=SESSION_FILE)
            print(f"✅ נטען session קיים עבור {username}")
            return True
    except FileNotFoundError:
        print("ℹ️  לא נמצא session קיים, נדרשת התחברות")
    except Exception as e:
        print(f"⚠️  לא ניתן לטעון session: {str(e)}")
    
    # בקשת התחברות חדשה
    if not username:
        username = input("👤 שם משתמש באינסטגרם: ")
    
    password = getpass.getpass("🔐 סיסמה: ")
    
    try:
        print("🔄 מתחבר לאינסטגרם...")
        L.login(username, password)
        
        # שמירת session לשימוש עתידי
        L.save_session_to_file(filename=SESSION_FILE)
        print("✅ התחברות הצליחה!")
        print(f"💾 Session נשמר ל-{SESSION_FILE} (ניתן לעשות שימוש חוזר)")
        return True
        
    except instaloader.exceptions.BadCredentialsException:
        print("❌ שם משתמש או סיסמה שגויים")
        return False
    except instaloader.exceptions.TwoFactorAuthRequiredException:
        print("🔐 נדרש אימות דו-שלבי")
        code = input("הזן קוד אימות: ")
        try:
            L.two_factor_login(code)
            L.save_session_to_file(filename=SESSION_FILE)
            print("✅ התחברות הצליחה!")
            return True
        except Exception as e:
            print(f"❌ שגיאה באימות דו-שלבי: {str(e)}")
            return False
    except Exception as e:
        print(f"❌ שגיאה בהתחברות: {str(e)}")
        return False

def main():
    print("="*60)
    print("🚀 בדיקת instaloader עם התחברות")
    print("="*60)
    print(f"📱 פרופיל יעד: {PROFILE_NAME}")
    print(f"📁 תיקיית פלט: {OUTPUT_DIR}")
    print(f"📊 מקסימום פוסטים: {MAX_POSTS}")
    print(f"💬 מקסימום תגובות לפוסט: {MAX_COMMENTS_PER_POST}\n")
    
    # יצירת instance של Instaloader
    L = instaloader.Instaloader(
        download_videos=True,
        download_video_thumbnails=True,
        download_geotags=True,
        download_comments=True,
        save_metadata=True,
        compress_json=False,
        post_metadata_txt_pattern='',
        max_connection_attempts=3,
        dirname_pattern=OUTPUT_DIR,
        request_timeout=300,
    )
    
    # שאלה האם להתחבר
    print("ℹ️  לסריקה מלאה (כולל סטוריז והיילייטס) נדרשת התחברות")
    login_choice = input("האם ברצונך להתחבר? (y/n): ").lower()
    
    if login_choice == 'y':
        username = input("👤 שם משתמש באינסטגרם (או Enter לדלג): ").strip()
        if username:
            if not login_to_instagram(L, username):
                print("\n⚠️  ממשיך ללא התחברות (פונקציונליות מוגבלת)")
        else:
            print("\n⚠️  ממשיך ללא התחברות")
    else:
        print("\n⚠️  ממשיך ללא התחברות (פונקציונליות מוגבלת)")
    
    try:
        # טעינת הפרופיל
        print(f"\n📥 טוען פרופיל {PROFILE_NAME}...")
        profile = instaloader.Profile.from_username(L.context, PROFILE_NAME)
        
        # איסוף נתוני פרופיל בסיסיים
        profile_data = {
            "username": profile.username,
            "full_name": profile.full_name,
            "biography": profile.biography,
            "bio_links": [],
            "external_url": profile.external_url,
            "followers": profile.followers,
            "followees": profile.followees,
            "mediacount": profile.mediacount,
            "is_verified": profile.is_verified,
            "is_private": profile.is_private,
            "profile_pic_url": profile.profile_pic_url,
        }
        
        # איסוף קישורים מהביו
        if profile.biography_mentions:
            profile_data["bio_mentions"] = profile.biography_mentions
        if profile.biography_hashtags:
            profile_data["bio_hashtags"] = profile.biography_hashtags
            
        print(f"\n✅ פרופיל נטען בהצלחה!")
        print(f"👤 שם: {profile.full_name}")
        print(f"📝 ביו: {profile.biography[:100]}..." if len(profile.biography) > 100 else f"📝 ביו: {profile.biography}")
        print(f"🔗 קישור חיצוני: {profile.external_url}")
        print(f"👥 עוקבים: {profile.followers:,}")
        print(f"📸 פוסטים: {profile.mediacount:,}")
        print(f"✓ מאומת: {'כן' if profile.is_verified else 'לא'}")
        print(f"🔒 פרטי: {'כן' if profile.is_private else 'לא'}")
        
        if profile.is_private and not L.context.is_logged_in:
            print("\n⚠️  הפרופיל פרטי! נדרשת התחברות ועקיבה אחרי הפרופיל")
            sys.exit(1)
        
        # שמירת תמונת פרופיל
        print(f"\n📷 מוריד תמונת פרופיל...")
        try:
            L.download_profilepic(profile)
            print("✅ תמונת פרופיל הורדה")
        except Exception as e:
            print(f"⚠️  שגיאה בהורדת תמונת פרופיל: {str(e)}")
        
        # ניסיון להוריד סטוריז
        stories_downloaded = 0
        if L.context.is_logged_in:
            print(f"\n📱 בודק סטוריז...")
            try:
                if profile.has_public_story or True:  # ננסה בכל מקרה
                    for story in L.get_stories(userids=[profile.userid]):
                        print(f"  📌 מצאתי סטורי עם {story.itemcount} פריטים")
                        for item in story.get_items():
                            try:
                                L.download_storyitem(item, f"{OUTPUT_DIR}/stories")
                                stories_downloaded += 1
                                print(f"    ✓ הורד פריט סטורי #{stories_downloaded}")
                            except Exception as e:
                                print(f"    ⚠️  שגיאה בהורדת פריט: {str(e)}")
                
                if stories_downloaded > 0:
                    print(f"✅ הורדו {stories_downloaded} פריטי סטורי")
                else:
                    print("ℹ️  לא נמצאו סטוריז פעילים כרגע (סטוריז נמחקות אחרי 24 שעות)")
            except Exception as e:
                print(f"⚠️  לא ניתן להוריד סטוריז: {str(e)}")
        else:
            print(f"\n⚠️  דילוג על סטוריז (נדרשת התחברות)")
        
        # ניסיון להוריד highlights
        highlights_downloaded = 0
        if L.context.is_logged_in:
            print(f"\n🎬 בודק היילייטס...")
            try:
                highlights = L.get_highlights(profile)
                for highlight in highlights:
                    print(f"  📌 היילייט: '{highlight.title}' ({highlight.itemcount} פריטים)")
                    for item in highlight.get_items():
                        try:
                            L.download_storyitem(item, f"{OUTPUT_DIR}/highlights/{highlight.title}")
                            highlights_downloaded += 1
                            print(f"    ✓ הורד פריט #{highlights_downloaded}")
                        except Exception as e:
                            print(f"    ⚠️  שגיאה: {str(e)}")
                
                if highlights_downloaded > 0:
                    print(f"✅ הורדו {highlights_downloaded} פריטי היילייט")
                else:
                    print("ℹ️  לא נמצאו היילייטס")
            except Exception as e:
                print(f"⚠️  לא ניתן להוריד היילייטס: {str(e)}")
        else:
            print(f"\n⚠️  דילוג על היילייטס (נדרשת התחברות)")
        
        # הורדת פוסטים
        print(f"\n📸 מוריד פוסטים (מקסימום {MAX_POSTS})...")
        print("ℹ️  זה עשוי לקחת זמן...\n")
        posts_data = []
        post_count = 0
        
        for post in profile.get_posts():
            if post_count >= MAX_POSTS:
                break
                
            post_count += 1
            print(f"  📝 פוסט {post_count}/{MAX_POSTS} - {post.date_local.strftime('%d/%m/%Y')}")
            
            try:
                # הורדת הפוסט עצמו
                L.download_post(post, target=OUTPUT_DIR)
                print(f"     ✓ הורד")
                
                # איסוף metadata של הפוסט
                post_info = {
                    "shortcode": post.shortcode,
                    "date": post.date_local.isoformat(),
                    "likes": post.likes,
                    "comments_count": post.comments,
                    "caption": post.caption,
                    "caption_hashtags": post.caption_hashtags,
                    "caption_mentions": post.caption_mentions,
                    "is_video": post.is_video,
                    "video_url": post.video_url if post.is_video else None,
                    "url": f"https://www.instagram.com/p/{post.shortcode}/",
                    "location": post.location.name if post.location else None,
                }
                
                # הורדת תגובות
                comments_list = []
                comment_count = 0
                
                try:
                    for comment in post.get_comments():
                        if comment_count >= MAX_COMMENTS_PER_POST:
                            break
                        
                        comments_list.append({
                            "id": comment.id,
                            "owner": comment.owner.username,
                            "text": comment.text,
                            "created_at": comment.created_at_utc.isoformat(),
                            "likes": comment.likes_count if hasattr(comment, 'likes_count') else 0,
                        })
                        comment_count += 1
                    
                    if comment_count > 0:
                        print(f"     ✓ {comment_count} תגובות")
                except Exception as e:
                    print(f"     ⚠️  שגיאה בתגובות: {str(e)}")
                
                post_info["comments"] = comments_list
                posts_data.append(post_info)
                
            except Exception as e:
                print(f"     ⚠️  שגיאה: {str(e)}")
            
            # הצגת התקדמות
            if post_count % 10 == 0:
                print(f"\n  ✅ הושלמו {post_count} פוסטים")
        
        print(f"\n✅ הורדו {post_count} פוסטים")
        
        # שמירת כל הנתונים לקובץ JSON
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        output_file = f"{OUTPUT_DIR}/profile_data.json"
        
        full_data = {
            "profile": profile_data,
            "posts": posts_data,
            "stats": {
                "total_posts_scanned": post_count,
                "stories_downloaded": stories_downloaded,
                "highlights_downloaded": highlights_downloaded,
            },
            "scan_date": datetime.now().isoformat(),
        }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(full_data, f, ensure_ascii=False, indent=2)
        
        print(f"\n💾 כל הנתונים נשמרו ב: {output_file}")
        
        # סיכום
        print("\n" + "="*60)
        print("📊 סיכום הסריקה:")
        print("="*60)
        print(f"✅ פרופיל: @{profile.username}")
        print(f"   שם: {profile.full_name}")
        print(f"   עוקבים: {profile.followers:,}")
        print(f"\n✅ תמונת פרופיל: הורדה")
        print(f"✅ פוסטים: {post_count}")
        print(f"✅ סטוריז: {stories_downloaded} פריטים")
        print(f"✅ היילייטס: {highlights_downloaded} פריטים")
        print(f"\n📁 מיקום קבצים: {OUTPUT_DIR}/")
        print(f"📄 קובץ נתונים: {output_file}")
        print("="*60)
        
        # המלצות
        print("\n💡 טיפים לשימוש עתידי:")
        print("1. לעדכון מהיר (רק פוסטים חדשים):")
        print(f"   instaloader --login YOUR_USERNAME --fast-update {PROFILE_NAME}")
        print("\n2. לסריקה מלאה מהטרמינל:")
        print(f"   instaloader --login YOUR_USERNAME --stories --highlights --comments {PROFILE_NAME}")
        print("\n3. ה-session נשמר, אז בפעם הבאה לא תצטרך להתחבר שוב")
        
    except instaloader.exceptions.ProfileNotExistsException:
        print(f"❌ שגיאה: הפרופיל '{PROFILE_NAME}' לא קיים")
        sys.exit(1)
    except instaloader.exceptions.ConnectionException as e:
        print(f"❌ שגיאת חיבור: {str(e)}")
        print("💡 ייתכן שאינסטגרם חסם את הבקשה. המלצות:")
        print("   - נסה שוב בעוד כמה דקות")
        print("   - השתמש בהתחברות")
        print("   - ודא שיש לך חיבור אינטרנט יציב")
        sys.exit(1)
    except instaloader.exceptions.PrivateProfileNotFollowedException:
        print(f"❌ שגיאה: הפרופיל '{PROFILE_NAME}' פרטי")
        print("💡 עליך לעקוב אחרי הפרופיל מהחשבון שבו התחברת")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n⚠️  הסריקה הופסקה על ידי המשתמש")
        print("💡 ניתן להמשיך מאוחר יותר עם --fast-update")
        sys.exit(0)
    except Exception as e:
        print(f"❌ שגיאה לא צפויה: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
