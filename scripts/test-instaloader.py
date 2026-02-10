#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
סקריפט לבדיקת instaloader על פרופיל אינסטגרם
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

# שם הפרופיל לסריקה
PROFILE_NAME = "miranbuzaglo"
MAX_POSTS = 150
MAX_COMMENTS_PER_POST = 3
OUTPUT_DIR = f"instaloader_test_{PROFILE_NAME}"

def main():
    print("🚀 מתחיל בדיקת instaloader")
    print(f"📱 פרופיל יעד: {PROFILE_NAME}")
    print(f"📁 תיקיית פלט: {OUTPUT_DIR}\n")
    
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
    )
    
    try:
        # טעינת הפרופיל
        print(f"📥 טוען פרופיל {PROFILE_NAME}...")
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
        print(f"🔒 פרטי: {'כן' if profile.is_private else 'לא'}")
        
        # שמירת תמונת פרופיל
        print(f"\n📷 מוריד תמונת פרופיל...")
        L.download_profilepic(profile)
        print("✅ תמונת פרופיל הורדה")
        
        # ניסיון להוריד סטוריז (דורש התחברות)
        print(f"\n📱 מנסה לגשת לסטוריז...")
        try:
            if profile.has_public_story:
                print("✅ יש סטורי פומבי זמין")
                for story in L.get_stories(userids=[profile.userid]):
                    print(f"  📌 מצאתי סטורי עם {story.itemcount} פריטים")
                    for item in story.get_items():
                        L.download_storyitem(item, f"{OUTPUT_DIR}/stories")
                        print(f"    ✓ הורד פריט סטורי")
            else:
                print("⚠️  אין סטוריז פומביים זמינים (או שנדרשת התחברות)")
        except Exception as e:
            print(f"⚠️  לא ניתן להוריד סטוריז: {str(e)}")
            print("   💡 ייתכן שנדרשת התחברות לחשבון אינסטגרם")
        
        # ניסיון להוריד highlights
        print(f"\n🎬 מנסה לגשת להיילייטס...")
        try:
            highlights = L.get_highlights(profile)
            highlight_count = 0
            for highlight in highlights:
                highlight_count += 1
                print(f"  📌 היילייט: {highlight.title} ({highlight.itemcount} פריטים)")
                for item in highlight.get_items():
                    L.download_storyitem(item, f"{OUTPUT_DIR}/highlights/{highlight.title}")
                    print(f"    ✓ הורד פריט מהיילייט")
            
            if highlight_count == 0:
                print("⚠️  לא נמצאו היילייטס פומביים")
            else:
                print(f"✅ הורדו {highlight_count} היילייטס")
        except Exception as e:
            print(f"⚠️  לא ניתן להוריד היילייטס: {str(e)}")
            print("   💡 ייתכן שנדרשת התחברות או שהפרופיל פרטי")
        
        # הורדת פוסטים
        print(f"\n📸 מוריד פוסטים (מקסימום {MAX_POSTS})...")
        posts_data = []
        post_count = 0
        
        for post in profile.get_posts():
            if post_count >= MAX_POSTS:
                break
                
            post_count += 1
            print(f"\n  📝 פוסט {post_count}/{MAX_POSTS}")
            print(f"     תאריך: {post.date_local}")
            print(f"     לייקים: {post.likes:,}")
            print(f"     תגובות: {post.comments}")
            
            # הורדת הפוסט עצמו
            L.download_post(post, target=OUTPUT_DIR)
            
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
            
            # הורדת תגובות (עד 3 ראשונות)
            print(f"     💬 מוריד עד {MAX_COMMENTS_PER_POST} תגובות...")
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
                
                print(f"     ✓ הורדו {comment_count} תגובות")
            except Exception as e:
                print(f"     ⚠️  שגיאה בהורדת תגובות: {str(e)}")
            
            post_info["comments"] = comments_list
            posts_data.append(post_info)
            
            # הצגת התקדמות
            if post_count % 10 == 0:
                print(f"\n  ✅ הושלמו {post_count} פוסטים")
        
        print(f"\n✅ הורדו {post_count} פוסטים")
        
        # שמירת כל הנתונים לקובץ JSON
        output_file = f"{OUTPUT_DIR}/profile_data.json"
        full_data = {
            "profile": profile_data,
            "posts": posts_data,
            "scan_date": datetime.now().isoformat(),
            "total_posts_scanned": post_count,
        }
        
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(full_data, f, ensure_ascii=False, indent=2)
        
        print(f"\n💾 כל הנתונים נשמרו ב: {output_file}")
        
        # סיכום
        print("\n" + "="*60)
        print("📊 סיכום הסריקה:")
        print("="*60)
        print(f"✅ פרופיל: {profile.username} ({profile.full_name})")
        print(f"✅ תמונת פרופיל: הורדה")
        print(f"✅ פוסטים: {post_count}")
        print(f"✅ נתוני JSON: נשמרו")
        print(f"📁 מיקום קבצים: {OUTPUT_DIR}/")
        print("="*60)
        
        # המלצות
        print("\n💡 המלצות:")
        print("1. לגישה לסטוריז והיילייטס פרטיים, יש להתחבר עם:")
        print(f"   instaloader --login YOUR_USERNAME --stories --highlights {PROFILE_NAME}")
        print("\n2. לעדכון הפרופיל בעתיד:")
        print(f"   instaloader --fast-update {PROFILE_NAME}")
        print("\n3. הקבצים שהורדו ב-{} מכילים:".format(OUTPUT_DIR))
        print("   - תמונות/סרטונים")
        print("   - קבצי JSON עם metadata")
        print("   - תמונת פרופיל")
        
    except instaloader.exceptions.ProfileNotExistsException:
        print(f"❌ שגיאה: הפרופיל '{PROFILE_NAME}' לא קיים")
        sys.exit(1)
    except instaloader.exceptions.ConnectionException as e:
        print(f"❌ שגיאת חיבור: {str(e)}")
        print("💡 ייתכן שאינסטגרם חסם את הבקשה. נסה שוב מאוחר יותר")
        sys.exit(1)
    except Exception as e:
        print(f"❌ שגיאה לא צפויה: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
