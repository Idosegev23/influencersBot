-- Migration 023: Fix video_duration type
-- שינוי video_duration מ-INTEGER ל-NUMERIC(10,2) לתמיכה בעשרוניות

-- שינוי הטיפוס של video_duration
ALTER TABLE instagram_posts 
  ALTER COLUMN video_duration TYPE NUMERIC(10,2);

-- הוספת comment להבהרה
COMMENT ON COLUMN instagram_posts.video_duration IS 'Video duration in seconds (supports decimals, e.g., 19.7)';
