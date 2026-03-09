ALTER TABLE "GroupContainer" ADD COLUMN "folderLabelSnapshot" TEXT NOT NULL DEFAULT 'Standalone';

CREATE TABLE "GroupExecutionFolder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "folderLabel" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "GroupExecutionFolder_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GroupExecutionFolder_groupId_folderLabel_key" ON "GroupExecutionFolder"("groupId", "folderLabel");
CREATE UNIQUE INDEX "GroupExecutionFolder_groupId_position_key" ON "GroupExecutionFolder"("groupId", "position");
