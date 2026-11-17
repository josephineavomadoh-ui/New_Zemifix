-- Add imageUrl column to assets table
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
