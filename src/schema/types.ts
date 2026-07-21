/**
 * Minimal structural typing for the subset of JSON Schema (draft 2020-12)
 * that the bundled EVAnalyzer schemas actually use. Not a general-purpose
 * JSON Schema type — just enough to drive the creation wizard.
 */
export interface JsonSchema {
  $ref?: string;
  title?: string;
  description?: string;
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean" | "null";
  const?: unknown;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  $defs?: Record<string, JsonSchema>;
}

export interface RootSchemaFile extends JsonSchema {
  $defs: Record<string, JsonSchema>;
}
