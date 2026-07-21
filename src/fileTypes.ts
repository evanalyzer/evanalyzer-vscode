export interface EvaFileType {
  /** Root definition name inside the schema file, and the file's title. */
  title: string;
  /** File extension including the leading dot. */
  extension: string;
  /** Schema file name under ./schemas. */
  schemaFile: string;
  /** Suggested base file name offered in the save prompt. */
  suggestedName: string;
}

export const PROJECT: EvaFileType = {
  title: "EVAnalyzer Project",
  extension: ".evaproj",
  schemaFile: "project.schema.json",
  suggestedName: "new-project",
};

export const PROJECT_TEMPLATE: EvaFileType = {
  title: "EVAnalyzer Project Template",
  extension: ".evapt",
  schemaFile: "project_template.schema.json",
  suggestedName: "new-project-template",
};

export const PIPELINE_TEMPLATE: EvaFileType = {
  title: "EVAnalyzer Pipeline Template",
  extension: ".evapipe",
  schemaFile: "pipeline_template.schema.json",
  suggestedName: "new-pipeline-template",
};
