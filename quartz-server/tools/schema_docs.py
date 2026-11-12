#!/usr/bin/env python3
"""Read schema metadata (never table rows) and maintain the architecture database reference."""
import argparse
import json
import pathlib
import re
import subprocess

# Column descriptions come from database COMMENT, maintained in database/init.sql.
GROUPS = {
 '内容发现': ['content','content_meta','content_sources','share_identities'],
 '友链与反馈': ['friends','friend_jobs','feedback'],
 '访客统计': ['visitors','daily_visitors','visitor_fixtures','geoip_datasets'],
 '视频与仓库缓存': ['videos','video_meta','video_assets','repo_snapshots','repo_avatar','adapter_snapshots'],
 '认证与配置': ['settings','auth_state','auth_sessions','auth_attempts','provider_credentials','service_credentials'],
 '运行状态': ['monitored_services','alerts','journal','runtime_state','resource_locks'],
}


def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--container',default='quartz-mysql')
 parser.add_argument('--database',default='quartz')
 parser.add_argument('--directory',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]/'architecture')
 args=parser.parse_args()
 if not re.fullmatch(r'[A-Za-z0-9_]+',args.database):raise ValueError('Invalid database name')
 def query(sql):
  cmd=['docker','exec','-i',args.container,'sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; export MYSQL_PWD; exec mysql -u root --default-character-set=utf8mb4 --batch --raw --skip-column-names "$@"','mysql',args.database]
  return subprocess.run(cmd,input=sql,text=True,capture_output=True,check=True).stdout
 def rows(sql):return [json.loads(row) for row in query(sql).split("\n") if row]
 database=args.database
 tables=rows(f"SELECT JSON_OBJECT('name',TABLE_NAME,'comment',TABLE_COMMENT,'engine',ENGINE,'collation',TABLE_COLLATION) FROM information_schema.TABLES WHERE TABLE_SCHEMA='{database}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;")
 columns=rows(f"SELECT JSON_OBJECT('table',TABLE_NAME,'name',COLUMN_NAME,'type',COLUMN_TYPE,'nullable',IS_NULLABLE,'default',COLUMN_DEFAULT,'extra',EXTRA,'generation',GENERATION_EXPRESSION,'comment',COLUMN_COMMENT) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='{database}' ORDER BY TABLE_NAME,ORDINAL_POSITION;")
 indexes=rows(f"SELECT JSON_OBJECT('table',TABLE_NAME,'name',INDEX_NAME,'unique',NOT NON_UNIQUE,'column',COLUMN_NAME,'order',COLLATION) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='{database}' ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;")
 # SHOW CREATE is authoritative: MySQL 8.4 information_schema.CHECK_CLAUSE
 # can return escaped, mojibake text for non-ASCII enum literals.
 checks=[]
 definitions={}
 for table in tables:
  ddl=query('SHOW CREATE TABLE `'+table['name']+'`;').split('\t',1)[1].strip()
  definitions[table['name']]=re.sub(r' AUTO_INCREMENT=\d+','',ddl)
  for line in ddl.split('\n'):
   match=re.match(r'\s*CONSTRAINT `([^`]+)` CHECK (.*?)(?:,)?$',line)
   if match:checks.append({'table':table['name'],'name':match[1],'clause':match[2]})

 foreign=rows(f"SELECT JSON_OBJECT('table',k.TABLE_NAME,'name',k.CONSTRAINT_NAME,'column',k.COLUMN_NAME,'parent',k.REFERENCED_TABLE_NAME,'parent_column',k.REFERENCED_COLUMN_NAME,'delete',r.DELETE_RULE,'update',r.UPDATE_RULE) FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA='{database}' AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION;")
 if {t['name'] for t in tables}!={name for names in GROUPS.values() for name in names}:raise ValueError('Table inventory changed: update module groups')
 for c in columns:
  if not c['comment']:raise ValueError('Undocumented field: '+c['table']+'.'+c['name'])

 if any(not t['comment'] for t in tables):raise ValueError('Every table must have a database comment')
 version='当前结构'
 lines=['# 本站库表设计','',f'数据库：`{database}`；MySQL 8.4；共 {len(tables)} 张表。','',
 '本文描述本站 MySQL，不包含 OpenList、Jellyfin、Beszel、Gitea、Artalk 自有库。字段、默认值、索引和约束从已应用结构生成；不读取或导出业务行、账号密码、Token、Cookie 或密钥。完整建表语句见 [初始化 SQL](../quartz-server/database/init.sql)。','',
 '## 设计约定','',
 '- InnoDB、utf8mb4；表级排序规则见下方明细。多数业务时间沿用来源的 ISO 8601 字符串，以保持现有接口契约；认证过期时间使用 Unix 毫秒。日访客按 Asia/Shanghai 归日。',
 '- 明确的结构化字段使用原生 JSON，由数据库验证语法；混合纯文本值的 video_meta、content_meta、runtime_state 等继续保留文本类型，按键解释。JSON 不等于业务结构校验，应用仍检查具体字段。',
 '- daily_visitors、visitor_fixtures 对 visitors 有物理外键，删除父访客自动级联删除这两类记录。内容及认证版本关联仍由应用维护，不应把逻辑关联图全部视为物理外键。日常业务变更优先通过星枢数据管理。',
 '- 四源索引只收录各类项目入口；分享子目录及管理员空间不单独入索引。最终标签统一查询 content.tags；文章只从 Markdown 热更新快照同步，编辑标签写回原始文件，不使用 extra.tagsManaged。非文章的 extra.tagsManaged 表示人工维护，extra.sourceTags 用于恢复来源标签。',
 '- 文章的 `content.extra.filePath` 保存原始相对路径，用于恢复含空格等字符的目录名，也是管理员标签操作写回 Markdown 的唯一文件定位；公开 API 的 `slug`/`href` 继续作为规范路由，不能用原始文件名替换跳转地址。',
 '- 索引和内容纪事在同一个 MySQL 事务提交，journal 只保留最近十条；不再维护待消费事件表。构建、服务恢复的去重检查点另存 runtime_state。',
 '- alerts 只供管理员查询；连续同类异常按十分钟静默间隔合并，新增事件时裁剪最近1000条，不设清理周期任务。告警写入由既有请求、任务及观察器异常触发，队列或数据库故障回退进程日志。',
 '- 平台凭据以加密信封保存，TOTP 密钥也以加密形式保存；相关加密密钥和访客身份密钥位于私有文件。`settings` 仍可能包含内部服务地址或私密配置，不能公开整表。',
 '- geoip_datasets 保存压缩的 IPv4/IPv6 XDB 参考库，启动校验并载入内存；星历按月拆分 adapter_snapshots，公开 API 只读取指定月份。',
 '- 数据库备份必须同时保留 `runtime/server/auth/` 和部署密钥；只备份库不足以恢复加密凭据及原有身份。','',
 '## 逻辑关联','',
 '下图中访客与每日记录、测试标记之间的实线是数据库外键，其余虚线为应用层关联。','',
 '```mermaid','flowchart LR',
 '    Sources["文章 / 分享 / 仓库 / 视频"] --> Content["content · 统一索引"]',
 '    Share["share_identities · 分享稳定标识"] -.-> Content',
 '    Content -->|同一事务| Journal["journal · 最近十条纪事"]',
 '    State["runtime_state · 私有消费检查点"] -.-> Journal',
 '    Visitors["visitors.identity"] --> Daily["daily_visitors.identity"]',
 '    Visitors --> Fixtures["visitor_fixtures.identity"]',
 '    Auth["auth_state · 密码与验证器版本"] -.-> Sessions["auth_sessions.version"]',
 '```','', '## 表目录','', '| 模块 | 表 | 用途 |','| --- | --- | --- |']
 lookup={t['name']:t for t in tables}
 for group,names in GROUPS.items():
  for name in names:lines.append(f"| {group} | [`{name}`](#{name}) | {lookup[name]['comment']} |")
 def cell(value):return str(value).replace('|','\\|').replace('\n',' ')
 def code(value):
  text=cell(value);mark='``' if '`' in text else '`'
  return mark+text+mark
 for group,names in GROUPS.items():
  lines+=['',f'## {group}']
  for name in names:
   table=lookup[name]
   lines+=['',f'<a id="{name}"></a>','',f'### {name}','',table['comment']+'。', '',f"引擎：`{table['engine']}`；排序规则：`{table['collation']}`。",'', '| 字段 | 类型 | 可空 | 默认值 / 自动值 | 含义 |','| --- | --- | --- | --- | --- |']
   for c in (x for x in columns if x['table']==name):
    default='—' if c['default'] is None else '`'+cell(c['default'])+'`'
    if c['nullable']=='YES' and c['default'] is None:default='NULL'
    if c['generation']:default='生成列：'+code(c['generation'])
    elif c['extra'] and c['extra']!='DEFAULT_GENERATED':default+=('；'+cell(c['extra']))
    lines.append(f"| `{c['name']}` | `{c['type']}` | {'是' if c['nullable']=='YES' else '否'} | {default} | {cell(c['comment'])} |")
   grouped={}
   for index in (x for x in indexes if x['table']==name):grouped.setdefault(index['name'],[]).append(index)
   lines+=['','索引与约束：','']
   for key,items in grouped.items():
    kind='主键' if key=='PRIMARY' else '唯一索引' if items[0]['unique'] else '普通索引'
    cols=', '.join('`'+x['column']+'`'+(' DESC' if x['order']=='D' else '') for x in items)
    lines.append(f'- {kind} `{key}`：{cols}。')
   for c in (x for x in checks if x['table']==name):lines.append(f"- CHECK `{c['name']}`：{code(c['clause'])}。")
   for f in (x for x in foreign if x['table']==name):
    lines.append(f"- 外键 `{f['name']}`：`{f['column']}` → `{f['parent']}.{f['parent_column']}`；删除 {f['delete']}，更新 {f['update']}。")
 lines+=['','## 管理与演进边界','',
 '- 星枢数据管理覆盖业务、索引辅助状态及缓存；认证表、平台凭据、资源锁与私有运行检查点不作为通用增删改查入口。',
 '- `visitor_fixtures` 和 `friends.example` 是现存测试/历史数据支持字段，不能把它们解释为必须在前台展示的标签。',
 '- 仅维护当前结构初始化文件 `quartz-server/database/init.sql`；服务启动不检查或修改表结构。开发调整数据库后同步初始化 SQL 和文档。',
 '- 字段说明维护在数据库 COMMENT 中，新增表时同时更新 `quartz-server/tools/schema_docs.py` 的模块分组，再运行下方命令刷新本文与 SQL 结构快照。生成器只查询结构元数据，不导出业务数据。','',
 '```sh','cd /home/goblincwl/docker/quartz4','python3 quartz-server/tools/schema_docs.py','```','']
 args.directory.mkdir(parents=True,exist_ok=True)
 (args.directory/'database.md').write_text('\n'.join(lines))
 ddl=[f'-- 本站 MySQL 结构快照；只含结构，不含业务数据。', '-- 当前结构初始化文件：quartz-server/database/init.sql；重新生成：python3 quartz-server/tools/schema_docs.py', 'SET NAMES utf8mb4;','']
 pending={t['name'] for t in tables};ordered=[]
 while pending:
  ready=sorted(name for name in pending if not any(f['table']==name and f['parent'] in pending for f in foreign))
  if not ready:raise ValueError('Cyclic foreign keys require an explicit schema export strategy')
  ordered.extend(ready);pending.difference_update(ready)
 for name in ordered:
  raw=definitions[name]
  ddl.append(raw+';\n')
 initial_sql=pathlib.Path(__file__).resolve().parents[1]/'database/init.sql'
 service_seeds=initial_sql.read_text().split('-- Initial service-list data.',1)[-1] if '-- Initial service-list data.' in initial_sql.read_text() else ''
 ddl.append("INSERT INTO resource_locks(name) VALUES('friends'),('journal'),('content'),('alerts');\n")
 if service_seeds:ddl.append('\n-- Initial service-list data.'+service_seeds)
 target=pathlib.Path(__file__).resolve().parents[1]/'database/init.sql'
 target.parent.mkdir(exist_ok=True)
 target.write_text('\n'.join(ddl))

 print(f'Updated schema documentation: {len(tables)} tables, {len(columns)} fields, version {version}.')

if __name__=='__main__':main()
