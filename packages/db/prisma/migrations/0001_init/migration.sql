PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Group" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Group_slug_key" ON "Group"("slug");

CREATE TABLE IF NOT EXISTS "GroupContainer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "containerKey" TEXT NOT NULL,
  "containerNameSnapshot" TEXT NOT NULL,
  "lastResolvedDockerId" TEXT,
  "aliasName" TEXT,
  "notes" TEXT,
  "includeInStartAll" BOOLEAN NOT NULL DEFAULT 1,
  "includeInStopAll" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupContainer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupContainer_groupId_containerKey_key" ON "GroupContainer"("groupId", "containerKey");

CREATE TABLE IF NOT EXISTS "DependencyEdge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "fromGroupContainerId" TEXT NOT NULL,
  "toGroupContainerId" TEXT NOT NULL,
  "waitStrategy" TEXT,
  "timeoutSeconds" INTEGER,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DependencyEdge_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DependencyEdge_fromGroupContainerId_fkey" FOREIGN KEY ("fromGroupContainerId") REFERENCES "GroupContainer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DependencyEdge_toGroupContainerId_fkey" FOREIGN KEY ("toGroupContainerId") REFERENCES "GroupContainer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DependencyEdge_groupId_fromGroupContainerId_toGroupContainerId_key" ON "DependencyEdge"("groupId", "fromGroupContainerId", "toGroupContainerId");

CREATE TABLE IF NOT EXISTS "GroupRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "completedAt" DATETIME,
  "summaryJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupRun_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "GroupRunStep" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupRunId" TEXT NOT NULL,
  "groupContainerId" TEXT,
  "containerKey" TEXT,
  "containerNameSnapshot" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "startedAt" DATETIME NOT NULL,
  "completedAt" DATETIME,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupRunStep_groupRunId_fkey" FOREIGN KEY ("groupRunId") REFERENCES "GroupRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GroupRunStep_groupContainerId_fkey" FOREIGN KEY ("groupContainerId") REFERENCES "GroupContainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "GroupGraphLayout" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "groupContainerId" TEXT NOT NULL,
  "positionX" REAL NOT NULL,
  "positionY" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupGraphLayout_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GroupGraphLayout_groupContainerId_fkey" FOREIGN KEY ("groupContainerId") REFERENCES "GroupContainer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupGraphLayout_groupId_groupContainerId_key" ON "GroupGraphLayout"("groupId", "groupContainerId");
