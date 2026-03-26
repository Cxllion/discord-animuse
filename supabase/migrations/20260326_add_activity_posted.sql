-- Migration: Activity Posted Deduplication Table
-- Run this once in the Supabase SQL Editor.
-- After running, the bot will automatically persist posted activity IDs
-- to this table (Render-safe, survives restarts & redeploys).

CREATE TABLE IF NOT EXISTS activity_posted (
    activity_id TEXT PRIMARY KEY,
    posted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups by timestamp (for future cleanup jobs)
CREATE INDEX IF NOT EXISTS idx_activity_posted_at ON activity_posted (posted_at);

-- Auto-prune rows older than 30 days (optional, run manually or via pg_cron)
-- DELETE FROM activity_posted WHERE posted_at < NOW() - INTERVAL '30 days';
