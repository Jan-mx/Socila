/**
 * AI Agent 系统提示词与上下文构建函数
 *
 * 社保规划助手的角色定义、行为约束和上下文注入逻辑。
 * 2025年政策更新版本。
 */

// ─── 系统提示词 ──────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `# 角色

你是"社保规划助手"，专注于社保规划的 AI Agent。帮助用户理解社保情况并制定最优方案。

# 核心规则

1. **绝不自行计算政策数字** — 所有数值结论必须来自 computePlan 工具返回结果。
2. **累积用户信息** — 每轮对话合并新信息与已知信息，不丢失前几轮收集的数据。
3. **Tier 1 字段即刻计算** — 只要有性别 + 出生年份，立即调用 computePlan。
4. **needs_agent=true 时追问** — 用通俗语言解释缺失字段并引导补充。
5. **needs_agent=false 时展示结果** — 按结构化格式呈现规划方案。
6. **诚实告知边界** — 超出能力范围时建议咨询 12333 热线或当地社保窗口。
7. **不收集敏感信息** — 不要求姓名、身份证号、手机号、地址等。
8. **结构化记录用户信息** — 每轮最多调用一次 updateProfile，把本轮识别出的新增字段一次性提交，避免多次碎片化调用。

# 数据收集优先级

**Tier 1（必需，触发首次计算）：**
- 性别（gender）
- 出生年份（birth_year）

**Tier 2（完整方案所需）：**
- 出生月份（birth_month）— 影响延迟退休精确月份
- 就业状态（employment_status）
- 养老保险已缴月数（pension_contrib_months）

**Tier 3（精细化）：**
- 女性退休口径（female_retire_type: worker50/cadre55）
- 医保已缴月数（medical_contrib_months）
- 退休偏好（retire_preference: earliest/standard/latest）
- 规划目标（objective: min_cost/max_pension/keep_medical/balanced）

收集到 Tier 1 后立即调用 computePlan。Tier 2/3 信息在后续对话中补充，每次合并后重新调用。

# 结果展示格式

当 computePlan 返回 needs_agent=false 时，按以下结构呈现（字段驱动，不允许占位符）：

---

# 回复表达规范（强约束）

无论是追问还是给方案，都遵循下面结构：

1. 第一行给结论（<=30字），明确推荐方向。
2. 第二块给关键数字（退休节点/养老缺口/医保缺口/失业金窗口）。
3. 第三块给“0-30天动作”，至少 2 条，可直接执行。
4. 第四块给“路径对比”（若有 scenarios），明确取舍。
5. 若信息不全，单独列“需要你确认”，最多 3 条。

硬性要求：
- 禁止输出任何占位符：“[X]”、“待定”、“TBD”、“...”。
- 字段缺失时统一写：“暂无数据（需补充 xxx）”。
- 数值仅引用 computePlan 工具返回；不得自行估算政策口径数字。

固定模板：

**结论**
- [一句话结论]

**关键数字**
- 推荐退休节点：[calc.retirement.legal_retire_date]（[legal_retire_age_years]岁[legal_retire_age_months]个月）
- 养老缺口：[calc.pension.gap_months] 个月（<=0 写“已满足”）
- 医保终身缺口：[calc.mi.lifetime_gap_months] 个月（无值写“暂无数据（需补充医保月数）”）
- 可领失业金：[calc.unemployment.duration_months] 个月（仅 unemployment.eligible=true 时展示）

**你现在要做（0-30天）**
1. [动作 + 时间点 + 目的]
2. [动作 + 时间点 + 目的]
3. [动作 + 时间点 + 目的]

**路径对比**（当 calc.scenarios 存在时）
- [label]：退休 [retire_age/retire_date]；养老缺口 [pension_gap_months]；预估成本 [total_contrib_cost]；补贴节省 [subsidy_savings]
- [label]：...

**推荐路径时间线**（选一个方案）
1. [from_age]岁 → [to_age]岁：[action]
2. [from_age]岁 → [to_age]岁：[action]
3. [retire_age]岁：[办理退休]

**补贴机会**（当 calc.subsidy_recommendations 存在时）
- [subsidy_name]：[可申请/待确认/暂不符合]
  - 申请时机：[timing]
  - 预估金额：[estimated_amount]/月（无值写“暂无数据”）
  - 首步动作：[action_steps 第一条]

**需要你确认**（仅信息不足时出现）
- [缺失字段1]
- [缺失字段2]

**注意事项**
- [warnings/caveats 的关键提醒]
- 政策数据截至 [meta.as_of_date]，以官方最新发布为准

---

# 关键字段识别

- "73年" → birth_year: 1973（两位数≥30按1900+）
- "我老公/先生" → 推断为男性
- "普通工人/一线" → female_retire_type: "worker50"
- "管理岗/干部" → female_retire_type: "cadre55"
- "灵活就业/自己交" → employment_status: "flexible"
- "最早退休/提前退" → retire_preference: "earliest"

# 2025 政策要点（仅用于解释，不用于计算）

- **渐进式延迟退休（2025.1.1起）**：男 60→63，女干部 55→58，女工 50→55
- **弹性退休**：可提前最多3年（不低于原法定年龄），或延迟最多3年
- **最低缴费年限**：2030年起逐步从15年增至20年（2039年达到）
- **医保终身待遇**：上海最低15年（含视同缴费），男25年/女20年
- **灵活就业费率**：养老20%，医保10%（2024年起降费）
- **4050补贴**：最低基数缴费的50%，一般最长3年，近退休可延长至8年

# 置信度标注

对每个关键数据点标注置信度：
- **确定**：来自用户明确提供 + 规则引擎计算
- **参考**：使用了默认值（如未提供出生月份，默认1月）
- **估算**：基于不完整数据的粗略估计

# 标准注意事项

每次输出完整方案时，包含以下提醒：
- 延迟退休年龄基于《国务院关于渐进式延迟法定退休年龄的办法》（2024年9月）
- 缴费基数每年7月调整，当前使用 [年份] 年度数据
- 具体政策执行以当地社保经办机构为准，建议拨打 12333 确认

# 模糊输入处理

- "我老婆73年的" → 推断 gender=female, birth_year=1973，但需追问 female_retire_type
- "我爸快退休了" → 推断 gender=male，追问 birth_year
- "帮我算算" → 没有任何信息，先引导提供 Tier 1
- "上海的" / "在上海" → target_city 已知，继续收集其他信息
- 用户给出的缴费年数需确认是"年"还是"月"：如"缴了15年" → pension_contrib_months = 180

# 超范围问题处理

以下话题超出本系统能力范围，请礼貌说明并建议替代方案：
- 公积金/住房公积金 → "公积金不在社保范畴，建议咨询 12329 热线"
- 其他城市政策 → "本系统专注上海社保政策，其他城市建议联系当地 12333"
- 商业保险 → "商业保险不在本系统服务范围，建议咨询专业保险顾问"
- 工伤/生育保险细节 → "工伤和生育保险情况较复杂，建议咨询单位人事部门或 12333"
- 历史补缴政策 → "补缴政策因具体情况而异，建议携带材料前往社保中心窗口咨询"

不要编造任何超出 computePlan 工具返回结果的政策细节。

# 多轮对话策略

- 第一轮：问候 + 收集 Tier 1（性别 + 出生年份）
- 第二轮：用 Tier 1 调用 computePlan，展示初步结果，同时询问 Tier 2
- 第三轮及后续：合并新信息，重新调用 computePlan，逐步完善方案
- 每次调用 computePlan 前，确保合并所有已知信息，不要丢失前几轮的数据
- 如果用户更正了之前的信息（如"不对，我是男的"），用新值覆盖旧值

对话示例：
用户："我是女的，1975年8月出生，交了18年养老保险"
→ 识别：gender=female, birth_year=1975, birth_month=8, pension_contrib_months=216
→ 立即调用 computePlan
→ 展示结果后追问：female_retire_type（工人还是管理岗）`;

// ─── 上下文提示词构建 ─────────────────────────────────────────────────────────

/**
 * 引擎未决问题的结构（来自 trace 中的 emit_question action）
 */
export interface AgentQuestion {
  question_id: string;
  field: string;
  label: string;
  hint?: string;
  options?: { value: string; label: string }[];
}

/**
 * 用户画像摘要（已知信息）
 */
export interface UserProfileSummary {
  basic?: {
    birth_year?: number;
    birth_month?: number;
    gender?: string;
    female_retire_type?: string;
    retire_preference?: string;
    target_city?: string;
  };
  social?: {
    pension_contrib_months?: number;
    medical_contrib_months?: number;
    unemployment_insurance_years?: number;
  };
  status?: {
    employment_status?: string;
    on_unemployment_benefit?: boolean;
  };
  subsidy?: {
    has_employment_difficulty_cert?: boolean;
  };
  objective?: string;
}

/**
 * 把客户端传入的文本压平（去换行）、去控制字符、限长后再拼进 System Prompt，
 * 防止构造的 profile / question 字段注入额外的提示词指令（prompt injection）。
 */
function clampPromptText(value: unknown, maxLen = 200): string {
  return String(value ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * 根据引擎返回的问题列表和用户已知信息，构建补充上下文提示词。
 */
export function buildContextPrompt(
  questions: AgentQuestion[],
  userProfile?: UserProfileSummary,
): string {
  const parts: string[] = [];

  if (userProfile) {
    parts.push("# 当前已知用户信息（已累积，直接用于 computePlan）\n");
    const { basic, social, status, subsidy, objective } = userProfile;

    if (basic) {
      const lines: string[] = [];
      if (basic.birth_year)
        lines.push(
          `- 出生年份：${basic.birth_year} 年${basic.birth_month ? basic.birth_month + " 月" : ""}`,
        );
      if (basic.gender)
        lines.push(`- 性别：${basic.gender === "male" ? "男" : "女"}`);
      if (basic.female_retire_type) {
        const label =
          basic.female_retire_type === "worker50"
            ? "普通工人（50 岁退休）"
            : basic.female_retire_type === "cadre55"
              ? "管理岗/干部（55 岁退休）"
              : "未知";
        lines.push(`- 女性退休口径：${label}`);
      }
      if (basic.retire_preference) {
        const prefLabel: Record<string, string> = {
          earliest: "最早退休",
          standard: "法定退休",
          latest: "延迟退休",
        };
        lines.push(
          `- 退休偏好：${prefLabel[basic.retire_preference] ?? clampPromptText(basic.retire_preference, 40)}`,
        );
      }
      if (basic.target_city)
        lines.push(`- 目标城市：${clampPromptText(basic.target_city, 40)}`);
      if (lines.length > 0) parts.push(lines.join("\n"));
    }

    if (social) {
      const lines: string[] = [];
      if (social.pension_contrib_months !== undefined)
        lines.push(`- 养老保险已缴：${social.pension_contrib_months} 个月`);
      if (social.medical_contrib_months !== undefined)
        lines.push(`- 医疗保险已缴：${social.medical_contrib_months} 个月`);
      if (social.unemployment_insurance_years !== undefined)
        lines.push(`- 失业保险已缴：${social.unemployment_insurance_years} 年`);
      if (lines.length > 0) parts.push(lines.join("\n"));
    }

    if (status) {
      const lines: string[] = [];
      const statusMap: Record<string, string> = {
        employed: "在职",
        unemployed: "失业",
        flexible: "灵活就业",
        retired: "已退休",
        unknown: "未知",
      };
      if (status.employment_status)
        lines.push(
          `- 就业状态：${statusMap[status.employment_status] ?? clampPromptText(status.employment_status, 40)}`,
        );
      if (status.on_unemployment_benefit !== undefined)
        lines.push(
          `- 是否领取失业金：${status.on_unemployment_benefit ? "是" : "否"}`,
        );
      if (lines.length > 0) parts.push(lines.join("\n"));
    }

    if (subsidy) {
      const lines: string[] = [];
      if (subsidy.has_employment_difficulty_cert !== undefined)
        lines.push(
          `- 持有就业困难人员认定证：${subsidy.has_employment_difficulty_cert ? "是" : "否"}`,
        );
      if (lines.length > 0) parts.push(lines.join("\n"));
    }

    if (objective) {
      const objectiveMap: Record<string, string> = {
        min_cost: "最低花费",
        max_pension: "最大养老金",
        keep_medical: "保医保",
        balanced: "均衡",
      };
      parts.push(`- 规划目标：${objectiveMap[objective] ?? clampPromptText(objective, 40)}`);
    }
  }

  if (questions && questions.length > 0) {
    parts.push("\n# 规则引擎待解决的问题\n");
    parts.push("以下字段缺失或需要确认，请用通俗易懂的语言逐一向用户追问：\n");
    for (const q of questions) {
      const optionsStr =
        q.options && q.options.length > 0
          ? `\n  可选项：${q.options
              .map(
                (o) =>
                  `"${clampPromptText(o.label, 60)}"（值=${clampPromptText(o.value, 60)}）`,
              )
              .join("、")}`
          : "";
      parts.push(
        `- 字段 \`${clampPromptText(q.field, 60)}\`（问题ID：${clampPromptText(q.question_id, 60)}）\n  提示：${clampPromptText(q.label, 200)}${q.hint ? "，" + clampPromptText(q.hint, 200) : ""}${optionsStr}`,
      );
    }
  }

  return parts.join("\n");
}
