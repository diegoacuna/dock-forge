ALTER TABLE "GroupExecutionFolder" ADD COLUMN "stage" INTEGER NOT NULL DEFAULT 0;

UPDATE "GroupExecutionFolder"
SET "stage" = COALESCE("position", 0);

DROP INDEX IF EXISTS "GroupExecutionFolder_groupId_position_key";
