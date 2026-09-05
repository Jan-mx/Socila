// Param types matching socila_policy_params.schema.json

export interface PolicyPack {
  policy_pack_id: string;
  description?: string;
  as_of: string;
  params: ScalarParam[];
  tables: TableParam[];
}

export interface ScalarParam {
  param_id: string;
  type: "number" | "boolean" | "string" | "array";
  value: ParamValue;
  unit?: string;
  effective_from?: string;
  source?: string;
}

export interface TableParam {
  param_id: string;
  type: "table" | "timeline";
  effective_from?: string;
  key_fields: string[];
  value_fields: string[];
  rows: TableRow[];
  note?: string;
  source?: string;
}

export type TableRow = Record<string, string | number | boolean | null>;

export type ParamValue = string | number | boolean | number[] | string[] | null;

export interface TimelineParam {
  param_id: string;
  type: "timeline";
  effective_from?: string;
  key_fields: string[];
  value_fields: string[];
  rows: TimelineRow[];
  note?: string;
  source?: string;
}

export interface TimelineRow {
  [key: string]: string | number | boolean | null | undefined;
}
