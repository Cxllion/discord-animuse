-- Migration: Expand Activity Posted Table for Merging/Sessions
-- Run this in the Supabase SQL Editor.

-- Add columns for session tracking and deletion
ALTER TABLE activity_posted ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE activity_posted ADD COLUMN IF NOT EXISTS media_id TEXT;
ALTER TABLE activity_posted ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE activity_posted ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE activity_posted ADD COLUMN IF NOT EXISTS progress TEXT;
ALTER TABLE activity_posted ADD COLUMN IF NOT EXISTS status TEXT;

-- Index for session lookup: "Find most recent post by this user/media in this channel"
CREATE INDEX IF NOT EXISTS idx_activity_posted_lookup 
ON activity_posted (user_id, media_id, channel_id, posted_at DESC);
