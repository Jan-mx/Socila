-- 09-05 SDL-FR-011/012/013（NFR-005 最小删除 / NFR-006 可审计）：
-- 1) rules.dsl_version 已知旧值（SSP-DSL-1.0 / ssp_dsl_v1）规范化为 SOCILA-DSL-1.0；
--    出现未知值时中止，由人工分类后重新执行。
-- 2) 粤川示例（GD-EXAMPLE-BASE、SC-EXAMPLE-BASE 及四个固定参数）精确清理：
--    只匹配固定ID + 预期地区 + 版本1；存在非预期地区/版本/包的行，或快照成员、
--    冲突、发布台账引用任一固定业务键时中止。快照、用户、规划、对话、案例与
--    备份一概不动。重复执行为no-op（幂等）。
-- 日志只记录固定业务键、数量与结果，不记录用户数据。

DO $sdl$
DECLARE
  v_unknown integer;
  v_unknown_values text;
BEGIN
  SELECT count(*), COALESCE(string_agg(DISTINCT dsl_version, ', '), '')
    INTO v_unknown, v_unknown_values
  FROM rules
  WHERE dsl_version NOT IN ('SSP-DSL-1.0', 'ssp_dsl_v1', 'SOCILA-DSL-1.0');
  IF v_unknown > 0 THEN
    RAISE EXCEPTION 'SDL-FR-011: 发现未知 rules.dsl_version 值（% 行: %），migration中止；请人工分类后重新执行', v_unknown, v_unknown_values;
  END IF;
END
$sdl$;
--> statement-breakpoint
UPDATE rules
SET dsl_version = 'SOCILA-DSL-1.0', updated_at = now()
WHERE dsl_version IN ('SSP-DSL-1.0', 'ssp_dsl_v1');
--> statement-breakpoint
DO $sdl$
DECLARE
  v_bad_packs integer;
  v_bad_params integer;
  v_ref_members integer;
  v_ref_conflicts integer;
  v_ref_publishes integer;
  v_deleted_params integer;
  v_deleted_packs integer;
BEGIN
  -- 目标精确性：固定包ID的每一行都必须恰好是（固定ID, 预期地区, 版本1）。
  SELECT count(*) INTO v_bad_packs
  FROM policy_pack_versions
  WHERE policy_pack_id IN ('GD-EXAMPLE-BASE', 'SC-EXAMPLE-BASE')
    AND NOT (
         (policy_pack_id = 'GD-EXAMPLE-BASE' AND jurisdiction_code = '440000' AND version = 1)
      OR (policy_pack_id = 'SC-EXAMPLE-BASE' AND jurisdiction_code = '510000' AND version = 1)
    );
  IF v_bad_packs > 0 THEN
    RAISE EXCEPTION 'SDL-FR-013: policy_pack_versions 存在非预期地区/版本的示例行（% 行），删除中止', v_bad_packs;
  END IF;

  -- 参数：固定参数ID的每一行都必须恰好是（固定参数ID, 固定包ID, 预期地区, 版本1）。
  SELECT count(*) INTO v_bad_params
  FROM params
  WHERE param_id IN ('P-GD-MIN-WAGE-BASE', 'P-GD-MEDICAL-CAP', 'P-SC-MIN-WAGE-BASE', 'P-SC-MEDICAL-CAP')
    AND NOT (
         (param_id = 'P-GD-MIN-WAGE-BASE'  AND policy_pack_id = 'GD-EXAMPLE-BASE' AND jurisdiction_code = '440000' AND version = 1)
      OR (param_id = 'P-GD-MEDICAL-CAP'   AND policy_pack_id = 'GD-EXAMPLE-BASE' AND jurisdiction_code = '440000' AND version = 1)
      OR (param_id = 'P-SC-MIN-WAGE-BASE' AND policy_pack_id = 'SC-EXAMPLE-BASE' AND jurisdiction_code = '510000' AND version = 1)
      OR (param_id = 'P-SC-MEDICAL-CAP'   AND policy_pack_id = 'SC-EXAMPLE-BASE' AND jurisdiction_code = '510000' AND version = 1)
    );
  IF v_bad_params > 0 THEN
    RAISE EXCEPTION 'SDL-FR-013: params 存在非预期包/地区/版本的示例行（% 行），删除中止', v_bad_params;
  END IF;

  -- 引用检查：快照成员（不可变）、冲突、发布台账引用任一固定业务键 → 中止。
  SELECT count(*) INTO v_ref_members
  FROM policy_snapshot_members
  WHERE business_key IN ('GD-EXAMPLE-BASE', 'SC-EXAMPLE-BASE',
                         'P-GD-MIN-WAGE-BASE', 'P-GD-MEDICAL-CAP',
                         'P-SC-MIN-WAGE-BASE', 'P-SC-MEDICAL-CAP');
  IF v_ref_members > 0 THEN
    RAISE EXCEPTION 'SDL-FR-013: policy_snapshot_members 引用示例业务键（% 行），删除中止（快照不可变）', v_ref_members;
  END IF;

  SELECT count(*) INTO v_ref_conflicts
  FROM policy_conflicts
  WHERE business_key IN ('GD-EXAMPLE-BASE', 'SC-EXAMPLE-BASE',
                         'P-GD-MIN-WAGE-BASE', 'P-GD-MEDICAL-CAP',
                         'P-SC-MIN-WAGE-BASE', 'P-SC-MEDICAL-CAP');
  IF v_ref_conflicts > 0 THEN
    RAISE EXCEPTION 'SDL-FR-013: policy_conflicts 引用示例业务键（% 行），删除中止', v_ref_conflicts;
  END IF;

  SELECT count(*) INTO v_ref_publishes
  FROM publishes
  WHERE entity_id IN ('GD-EXAMPLE-BASE', 'SC-EXAMPLE-BASE',
                      'P-GD-MIN-WAGE-BASE', 'P-GD-MEDICAL-CAP',
                      'P-SC-MIN-WAGE-BASE', 'P-SC-MEDICAL-CAP');
  IF v_ref_publishes > 0 THEN
    RAISE EXCEPTION 'SDL-FR-013: publishes 引用示例业务键（% 行），删除中止', v_ref_publishes;
  END IF;

  DELETE FROM params
  WHERE (param_id, policy_pack_id, jurisdiction_code, version) IN (
    ('P-GD-MIN-WAGE-BASE', 'GD-EXAMPLE-BASE', '440000', 1),
    ('P-GD-MEDICAL-CAP',   'GD-EXAMPLE-BASE', '440000', 1),
    ('P-SC-MIN-WAGE-BASE', 'SC-EXAMPLE-BASE', '510000', 1),
    ('P-SC-MEDICAL-CAP',   'SC-EXAMPLE-BASE', '510000', 1)
  );
  GET DIAGNOSTICS v_deleted_params = ROW_COUNT;

  DELETE FROM policy_pack_versions
  WHERE (policy_pack_id, jurisdiction_code, version) IN (
    ('GD-EXAMPLE-BASE', '440000', 1),
    ('SC-EXAMPLE-BASE', '510000', 1)
  );
  GET DIAGNOSTICS v_deleted_packs = ROW_COUNT;

  RAISE NOTICE 'SDL-FR-012 示例清理: 删除 % 条示例参数, % 条示例包（预期 4/2；重跑为 0/0）',
    v_deleted_params, v_deleted_packs;
END
$sdl$;
