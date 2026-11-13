-- Additive migration, applied explicitly before deploying the task instance UI.
CREATE TABLE IF NOT EXISTS task_runs (
 id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '执行记录编号',
 task_key varchar(80) COLLATE utf8mb4_bin NOT NULL COMMENT '固定任务标识',
 run_key varchar(96) COLLATE utf8mb4_bin DEFAULT NULL COMMENT '外部观察器执行去重标识，本地执行为空',
 started_at varchar(40) COLLATE utf8mb4_bin NOT NULL COMMENT '开始时间，UTC ISO 8601',
 finished_at varchar(40) COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '结束时间，运行中为空',
 status varchar(16) COLLATE utf8mb4_bin NOT NULL COMMENT 'running / success / failed / interrupted',
 duration_ms bigint unsigned NOT NULL DEFAULT 0 COMMENT '执行耗时，毫秒',
 error text COLLATE utf8mb4_bin NOT NULL COMMENT '经过凭据过滤的错误，最多4000字',
 logs text COLLATE utf8mb4_bin NOT NULL COMMENT '经过凭据过滤的执行日志，最多12000字',
 PRIMARY KEY(id),
 UNIQUE KEY task_run_external(task_key,run_key),
 KEY task_run_history(task_key,id DESC),
 CONSTRAINT task_run_status CHECK(status IN ('running','success','failed','interrupted'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='后台任务最近十次真实执行记录';
