import { Workflow, WorkflowNode } from "./workflow.types";

export interface ValidationError {
  type: "schema" | "reference" | "type" | "tool";
  message: string;
  path?: string; // 指向错误发生位置的 JSON 指针
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
