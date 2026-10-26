PRAGMA foreign_keys=OFF;
-- Frozen historical schema fixture with synthetic data.
BEGIN TRANSACTION;
CREATE TABLE projects(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,repository_path TEXT,created_at REAL NOT NULL);
INSERT INTO "projects" VALUES('00000000-0000-4000-8000-000000000001','Fixture project',NULL,1.0);
CREATE TABLE task_checks(id TEXT PRIMARY KEY NOT NULL,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,title TEXT NOT NULL,is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN(0,1)));
INSERT INTO "task_checks" VALUES('check','00000000-0000-4000-8000-000000000002','Preserve this check',1);
CREATE TABLE task_messages(id TEXT PRIMARY KEY NOT NULL,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,author TEXT NOT NULL CHECK(author IN('user','agent')),body TEXT NOT NULL,created_at REAL NOT NULL);
INSERT INTO "task_messages" VALUES('message','00000000-0000-4000-8000-000000000002','agent','Public message',2.0);
CREATE TABLE tasks(id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,assignee TEXT NOT NULL CHECK(assignee IN('user','agent')),status TEXT NOT NULL CHECK(status IN('todo','inProgress','review','done','preparing','reserved')),agent_summary TEXT,created_at REAL NOT NULL,updated_at REAL NOT NULL);
INSERT INTO "tasks" VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Migrated task','Public briefing','Feature','agent','todo','Agent delivery',1.0,2.0);
CREATE INDEX tasks_project_updated ON tasks(project_id,updated_at DESC);
CREATE INDEX tasks_status ON tasks(status);
CREATE INDEX task_messages_task_created ON task_messages(task_id,created_at);
COMMIT;
PRAGMA user_version=1;
PRAGMA foreign_keys=ON;
