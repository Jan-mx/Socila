-- 数据库 Schema 只读清单（对账用）。
-- 输出与所连接库 public schema 等价的规范化 JSON：表、列、约束、外键、索引、扩展、枚举。
-- 用途：阶段01 空库迁移对账（FND-AC-001）、阶段07 迁移对账（数量/结构比对）。
-- 只读：仅查询 information_schema / pg_catalog，不修改任何对象。
with tabs as (
  select jsonb_agg(x order by x.table_name) v
  from (
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  ) x
),
cols as (
  select jsonb_agg(x order by x.table_name, x.column_name) v
  from (
    select table_name, column_name, data_type, udt_name, is_nullable,
           column_default, character_maximum_length, numeric_precision, numeric_scale
    from information_schema.columns
    where table_schema = 'public'
  ) x
),
kons as (
  select jsonb_agg(x order by x.table_name, x.constraint_name, x.ord) v
  from (
    select tc.table_name, tc.constraint_name, tc.constraint_type,
           kcu.column_name, kcu.ordinal_position as ord
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.constraint_schema = kcu.constraint_schema
     and tc.table_name = kcu.table_name
    where tc.table_schema = 'public'
      and tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
  ) x
),
fks as (
  select jsonb_agg(x order by x.table_name, x.constraint_name, x.ord) v
  from (
    select kcu.table_name, rc.constraint_name, kcu.column_name,
           kcu.ordinal_position as ord,
           ccu.table_name as foreign_table, ccu.column_name as foreign_column,
           rc.update_rule, rc.delete_rule
    from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu
      on rc.constraint_name = kcu.constraint_name
     and rc.constraint_schema = kcu.constraint_schema
    join information_schema.constraint_column_usage ccu
      on rc.unique_constraint_name = ccu.constraint_name
     and rc.unique_constraint_schema = ccu.constraint_schema
    where rc.constraint_schema = 'public'
  ) x
),
idx as (
  select jsonb_agg(x order by x.tablename, x.indexname) v
  from (
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
  ) x
),
exts as (
  select jsonb_agg(x order by x.extname) v
  from (select extname, extversion from pg_extension) x
),
enums as (
  select jsonb_agg(x order by x.typname) v
  from (
    select t.typname,
           jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    group by t.typname
  ) x
)
select jsonb_build_object(
  'tables', (select v from tabs),
  'columns', (select v from cols),
  'constraints', (select v from kons),
  'foreign_keys', (select v from fks),
  'indexes', (select v from idx),
  'extensions', (select v from exts),
  'enums', (select v from enums)
);
