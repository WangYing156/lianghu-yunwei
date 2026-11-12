-- =====================================================================
-- 两湖隧道（南湖段）智能运维管理平台 —— 业务库结构
-- 目标库：PostgreSQL 14+ （现场 172.28.12.194:5432/lhsd_app）
-- 约定：
--   * 所有表使用 snake_case；主键 bigserial；时间列带时区
--   * 状态/等级类字段用 text + CHECK，便于迭代，无需 ALTER TYPE
--   * 桩号统一文本（如 K3+050），排序/区间比较由应用层解析
-- =====================================================================

CREATE TABLE IF NOT EXISTS sys_user (
  id            bigserial PRIMARY KEY,
  username      varchar(64) NOT NULL UNIQUE,
  display_name  varchar(64) NOT NULL,
  password_hash text NOT NULL,
  role          varchar(32) NOT NULL DEFAULT 'operator'
                CHECK (role IN ('admin', 'manager', 'engineer', 'operator', 'viewer')),
  phone         varchar(32),
  dept          varchar(64),
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE sys_user IS '平台用户与角色（值班员/工程师/值班长/管理员）';

CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial PRIMARY KEY,
  user_id    bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  username   varchar(64),
  action     varchar(64) NOT NULL,
  resource   varchar(64) NOT NULL,
  method     varchar(8),
  path       text,
  resource_id text,
  ip         inet,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource, created_at DESC);

CREATE TABLE IF NOT EXISTS tunnel_section (
  id          bigserial PRIMARY KEY,
  code        varchar(32) NOT NULL UNIQUE,
  name        varchar(64) NOT NULL,
  stake_start varchar(16) NOT NULL,
  stake_end   varchar(16) NOT NULL,
  length_m    numeric(8, 1),
  sort_no     int NOT NULL DEFAULT 0
);
COMMENT ON TABLE tunnel_section IS '隧道区段划分（K2+100~K4+300），用于健康评估与流量分段';

CREATE TABLE IF NOT EXISTS device_category (
  code      varchar(32) PRIMARY KEY,
  name      varchar(64) NOT NULL,
  icon      varchar(16),
  group_code varchar(32) NOT NULL,
  sort_no   int NOT NULL DEFAULT 0
);
COMMENT ON TABLE device_category IS '设备分类字典：通风/排涝/照明/监控/交通设施/环境感知/结构监测';

-- 场景点位目录：三维场景与二维底图共用的点位坐标（页面级点位来自该目录）
CREATE TABLE IF NOT EXISTS scene_module (
  code      varchar(32) PRIMARY KEY,
  name      varchar(64) NOT NULL,
  path      varchar(64) NOT NULL UNIQUE,
  icon      varchar(16),
  sort_no   int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scene_point (
  id          varchar(48) PRIMARY KEY,
  module_code varchar(32) NOT NULL REFERENCES scene_module(code) ON DELETE CASCADE,
  name        varchar(96) NOT NULL,
  kind        varchar(32) NOT NULL,
  group_code  varchar(32) NOT NULL CHECK (group_code IN ('structure', 'env', 'traffic', 'monitor', 'mep')),
  status      varchar(16) NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warn', 'alarm', 'offline')),
  left_pct    numeric(6, 2) NOT NULL DEFAULT 50,
  top_pct     numeric(6, 2) NOT NULL DEFAULT 50,
  scale       numeric(4, 2) NOT NULL DEFAULT 1,
  stake       varchar(32) NOT NULL,
  value       varchar(64),
  alarm       varchar(128),
  inspect_on  date,
  device_id   bigint,
  sort_no     int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scene_point_module ON scene_point (module_code, sort_no);
CREATE INDEX IF NOT EXISTS idx_scene_point_group ON scene_point (group_code, kind);
COMMENT ON TABLE scene_point IS '三维/二维场景点位目录，按模块分组下发';

CREATE TABLE IF NOT EXISTS device (
  id            bigserial PRIMARY KEY,
  code          varchar(48) NOT NULL UNIQUE,
  name          varchar(96) NOT NULL,
  category_code varchar(32) NOT NULL REFERENCES device_category(code),
  group_code    varchar(32) NOT NULL CHECK (group_code IN ('structure', 'env', 'traffic', 'monitor', 'mep')),
  stake         varchar(32) NOT NULL,
  position_desc varchar(160),
  system_name   varchar(64),
  model         varchar(96),
  vendor        varchar(96),
  install_date  date,
  status        varchar(16) NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warn', 'alarm', 'offline')),
  /** 总览设备状态卡片的统计分组：video/env/vent/drain/light/board；为空表示不参与卡片统计 */
  card_group    varchar(16),
  run_state     varchar(32),
  ip            varchar(64),
  point_id      varchar(48),
  bif_code      varchar(64),
  attrs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_category ON device (category_code);
CREATE INDEX IF NOT EXISTS idx_device_status ON device (status);
CREATE INDEX IF NOT EXISTS idx_device_stake ON device (stake);
CREATE INDEX IF NOT EXISTS idx_device_card_group ON device (card_group, status);
COMMENT ON TABLE device IS '设施设备台账（与 BIM 构件编号 bif_code 关联）';

CREATE TABLE IF NOT EXISTS telemetry (
  id          bigserial PRIMARY KEY,
  device_id   bigint NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  metric      varchar(48) NOT NULL,
  unit        varchar(16),
  value       numeric(14, 4) NOT NULL,
  quality     varchar(16) NOT NULL DEFAULT 'good' CHECK (quality IN ('good', 'suspect', 'bad')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_metric_time ON telemetry (device_id, metric, recorded_at DESC);
COMMENT ON TABLE telemetry IS '设备遥测历史（演示为脚本写入的模拟序列，非实时测点）';

CREATE TABLE IF NOT EXISTS alert (
  id          bigserial PRIMARY KEY,
  code        varchar(48) NOT NULL UNIQUE,
  level       varchar(16) NOT NULL CHECK (level IN ('critical', 'warning', 'info', 'notice')),
  status      varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'closed')),
  source      varchar(32) NOT NULL,
  title       varchar(128) NOT NULL,
  description text NOT NULL DEFAULT '',
  stake       varchar(32),
  point_id    varchar(48),
  group_code  varchar(32),
  kind        varchar(32),
  device_id   bigint REFERENCES device(id) ON DELETE SET NULL,
  dedup_key   varchar(96),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  acked_at    timestamptz,
  acked_by    bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  closed_at   timestamptz,
  closed_by   bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  ack_note    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_status_level ON alert (status, level, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_occurred_at ON alert (occurred_at DESC);
COMMENT ON TABLE alert IS '告警事件（演示库内为示例事件，可由 IoT 网关写入同一结构）';

CREATE TABLE IF NOT EXISTS disease (
  id          bigserial PRIMARY KEY,
  code        varchar(48) NOT NULL UNIQUE,
  type        varchar(24) NOT NULL CHECK (type IN ('crack', 'seepage', 'spalling', 'joint', 'corrosion', 'other')),
  severity    varchar(16) NOT NULL CHECK (severity IN ('slight', 'medium', 'severe')),
  stake       varchar(32) NOT NULL,
  section_code varchar(32),
  description text NOT NULL DEFAULT '',
  source      varchar(16) NOT NULL CHECK (source IN ('manual', 'ai', 'public')),
  status      varchar(24) NOT NULL DEFAULT 'found'
              CHECK (status IN ('found', 'dispatched', 'repairing', 'reviewing', 'completed', 'rejected')),
  point_id    varchar(48),
  photos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  found_at    timestamptz NOT NULL DEFAULT now(),
  repaired_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disease_status ON disease (status, found_at DESC);
COMMENT ON TABLE disease IS '病害台账（裂缝/渗漏水/剥落/变形缝/腐蚀）';

CREATE TABLE IF NOT EXISTS work_order (
  id           bigserial PRIMARY KEY,
  code         varchar(48) NOT NULL UNIQUE,
  type         varchar(24) NOT NULL CHECK (type IN ('inspection', 'repair', 'maintain', 'emergency')),
  title        varchar(128) NOT NULL,
  description  text NOT NULL DEFAULT '',
  status       varchar(24) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'dispatched', 'processing', 'reviewing', 'completed', 'rejected', 'cancelled')),
  priority     varchar(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  source       varchar(16) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'public', 'inspection')),
  stake        varchar(32),
  disease_id   bigint REFERENCES disease(id) ON DELETE SET NULL,
  alert_id     bigint REFERENCES alert(id) ON DELETE SET NULL,
  reporter_id  bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  assignee_id  bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  sla_hours    int NOT NULL DEFAULT 24,
  due_at       timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  reject_reason text,
  photos       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_order_status ON work_order (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_order_assignee ON work_order (assignee_id, status);
COMMENT ON TABLE work_order IS '运维工单（巡检/维修/保养/应急），含流转日志';

CREATE TABLE IF NOT EXISTS work_order_log (
  id            bigserial PRIMARY KEY,
  work_order_id bigint NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  action        varchar(32) NOT NULL,
  from_status   varchar(24),
  to_status     varchar(24),
  operator_id   bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  remark        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_order_log_order ON work_order_log (work_order_id, created_at);

CREATE TABLE IF NOT EXISTS inspection_task (
  id           bigserial PRIMARY KEY,
  code         varchar(48) NOT NULL UNIQUE,
  name         varchar(128) NOT NULL,
  cycle        varchar(16) NOT NULL DEFAULT 'daily' CHECK (cycle IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  plan_date    date NOT NULL,
  status       varchar(16) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'running', 'done', 'missed')),
  assignee_id  bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  coverage     numeric(5, 2) NOT NULL DEFAULT 0,
  remark       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_plan (
  id          bigserial PRIMARY KEY,
  name        varchar(128) NOT NULL,
  cycle       varchar(16) NOT NULL DEFAULT 'monthly',
  next_date   date NOT NULL,
  last_date   date,
  owner_dept  varchar(64),
  status      varchar(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'due', 'overdue', 'done')),
  remark      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_plan_next ON maintenance_plan (next_date);

CREATE TABLE IF NOT EXISTS structural_health (
  id           bigserial PRIMARY KEY,
  section_code varchar(32) NOT NULL,
  section_name varchar(64) NOT NULL,
  score        numeric(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
  level        varchar(16) NOT NULL CHECK (level IN ('good', 'watch', 'warning', 'danger')),
  evaluated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_structural_health_time ON structural_health (evaluated_at DESC);

CREATE TABLE IF NOT EXISTS camera (
  id          bigserial PRIMARY KEY,
  code        varchar(48) NOT NULL UNIQUE,
  name        varchar(96) NOT NULL,
  type        varchar(16) NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'dome', 'ptz')),
  stake       varchar(32) NOT NULL,
  status      varchar(16) NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'alarm')),
  stream_url  text,
  preview_url text,
  point_id    varchar(48),
  ai_enabled  boolean NOT NULL DEFAULT true,
  last_online_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE camera IS '视频点位台账（stream_url 未接入真实流时为空，仅提供示例画面）';

CREATE TABLE IF NOT EXISTS traffic_event (
  id          bigserial PRIMARY KEY,
  code        varchar(48) NOT NULL UNIQUE,
  type        varchar(24) NOT NULL CHECK (type IN ('parking', 'congestion', 'debris', 'pedestrian', 'wrongway', 'accident', 'other')),
  level       varchar(16) NOT NULL DEFAULT 'medium' CHECK (level IN ('high', 'medium', 'low')),
  stake       varchar(32) NOT NULL,
  confidence  numeric(5, 2) NOT NULL DEFAULT 0,
  status      varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'handled', 'ignored')),
  camera_id   bigint REFERENCES camera(id) ON DELETE SET NULL,
  snapshot_url text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  handled_at  timestamptz,
  handled_by  bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  remark      text
);
CREATE INDEX IF NOT EXISTS idx_traffic_event_status ON traffic_event (status, detected_at DESC);

-- 交通流量分段（与 tunnel_section 分开：分段口径为 K2+100~K4+300 的 5 个检测区间）
CREATE TABLE IF NOT EXISTS traffic_segment (
  code      varchar(32) PRIMARY KEY,
  name      varchar(64) NOT NULL,
  stake_start varchar(16) NOT NULL,
  stake_end   varchar(16) NOT NULL,
  sort_no   int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS traffic_flow (
  id          bigserial PRIMARY KEY,
  section_code varchar(32) NOT NULL REFERENCES traffic_segment(code),
  direction   varchar(8) NOT NULL DEFAULT 'north' CHECK (direction IN ('north', 'south')),
  flow_vph    int NOT NULL,
  speed_kmh   numeric(5, 1),
  occupancy   numeric(5, 2),
  congestion  varchar(16) NOT NULL DEFAULT 'smooth' CHECK (congestion IN ('smooth', 'slow', 'congested')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traffic_flow_time ON traffic_flow (recorded_at DESC, section_code);

CREATE TABLE IF NOT EXISTS info_board (
  id       bigserial PRIMARY KEY,
  code     varchar(48) NOT NULL UNIQUE,
  name     varchar(96) NOT NULL,
  type     varchar(24) NOT NULL DEFAULT 'induce' CHECK (type IN ('induce', 'vms', 'lane')),
  stake    varchar(32) NOT NULL,
  status   varchar(16) NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  content  varchar(120),
  ip       varchar(64),
  point_id varchar(48),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publish_task (
  id              bigserial PRIMARY KEY,
  task_no         varchar(48) NOT NULL UNIQUE,
  title           varchar(128) NOT NULL,
  content         varchar(120) NOT NULL,
  level           varchar(16) NOT NULL DEFAULT 'info' CHECK (level IN ('normal', 'info', 'warning', 'emergency')),
  channels        text[] NOT NULL DEFAULT '{}',
  status          varchar(24) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending_review', 'published', 'offline', 'rejected')),
  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  board_ids       bigint[] NOT NULL DEFAULT '{}',
  created_by      bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  reviewed_by     bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  published_at    timestamptz,
  offline_at      timestamptz,
  reject_reason   text,
  reach_count     int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_publish_task_status ON publish_task (status, created_at DESC);
COMMENT ON TABLE publish_task IS '诱导屏/情报板发布任务（草稿→审核→发布→下刊）';

CREATE TABLE IF NOT EXISTS feedback (
  id           bigserial PRIMARY KEY,
  code         varchar(48) NOT NULL UNIQUE,
  channel      varchar(16) NOT NULL CHECK (channel IN ('miniapp', 'hotline', 'web', 'app')),
  content      text NOT NULL,
  stake        varchar(32),
  point_id     varchar(48),
  contact      varchar(64),
  status       varchar(16) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'reviewed', 'converted', 'invalid', 'closed')),
  work_order_id bigint REFERENCES work_order(id) ON DELETE SET NULL,
  handler_id   bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  handled_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public_notice (
  id           bigserial PRIMARY KEY,
  title        varchar(160) NOT NULL,
  content      text NOT NULL DEFAULT '',
  level        varchar(16) NOT NULL DEFAULT 'blue' CHECK (level IN ('red', 'yellow', 'blue')),
  channels     text[] NOT NULL DEFAULT '{}',
  status       varchar(16) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'offline')),
  published_at timestamptz NOT NULL DEFAULT now(),
  reach_count  int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_article (
  id           bigserial PRIMARY KEY,
  title        varchar(160) NOT NULL,
  category     varchar(32) NOT NULL DEFAULT '行车安全',
  icon         varchar(16),
  summary      text NOT NULL DEFAULT '',
  content      text NOT NULL DEFAULT '',
  views        int NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_material (
  id        bigserial PRIMARY KEY,
  name      varchar(96) NOT NULL,
  site      varchar(64) NOT NULL,
  stake     varchar(32),
  quantity  numeric(10, 2) NOT NULL DEFAULT 0,
  unit      varchar(16) NOT NULL DEFAULT '件',
  sufficient boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_run (
  id          bigserial PRIMARY KEY,
  scenario    varchar(24) NOT NULL CHECK (scenario IN ('fire', 'flood', 'accident', 'inspection')),
  operator_id bigint REFERENCES sys_user(id) ON DELETE SET NULL,
  step_reached int NOT NULL DEFAULT 0,
  total_steps int NOT NULL DEFAULT 0,
  immersive   boolean NOT NULL DEFAULT false,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  note        text
);
COMMENT ON TABLE simulation_run IS '四维工况推演运行记录（脚本推演，不是实时测点或设备指令）';

-- 迁移补丁区：已应用过 001 的库通过 DO 块补齐新增列/表（幂等）
DO $$
BEGIN
  IF NOT EXISTS (select 1 from information_schema.tables where table_schema='public' and table_name='traffic_segment') THEN
    CREATE TABLE traffic_segment (
      code      varchar(32) PRIMARY KEY,
      name      varchar(64) NOT NULL,
      stake_start varchar(16) NOT NULL,
      stake_end   varchar(16) NOT NULL,
      sort_no   int NOT NULL DEFAULT 0
    );
  END IF;
  IF NOT EXISTS (select 1 from information_schema.columns where table_schema='public' and table_name='device' and column_name='card_group') THEN
    ALTER TABLE device ADD COLUMN card_group varchar(16);
  END IF;
END
$$;

-- ============================ 常用视图 ============================
CREATE OR REPLACE VIEW v_device_status AS
SELECT
  d.id,
  d.code,
  d.name,
  d.category_code,
  c.name AS category_name,
  d.group_code,
  d.status,
  d.stake,
  d.last_seen_at
FROM device d
JOIN device_category c ON c.code = d.category_code;

CREATE OR REPLACE VIEW v_alert_open AS
SELECT * FROM alert WHERE status <> 'closed';
