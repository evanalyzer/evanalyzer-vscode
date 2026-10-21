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
  extension: ".evatemplate",
  schemaFile: "project_template.schema.json",
  suggestedName: "new-project-template",
};

/** A module library file - replaced the old `.evapipe` pipeline templates. */
export const MODULE_TEMPLATE: EvaFileType = {
  title: "EVAnalyzer Module",
  extension: ".evamodule",
  schemaFile: "module_template.schema.json",
  suggestedName: "new-module",
};

/**
 * The `--settings` file `evanalyzer train-classifier` reads. evanalyzer
 * itself accepts any `.json` path here; `.ailearning.json` is this
 * extension's own convention, so the file gets validation without the
 * extension having to claim every `.json` file.
 */
export const AI_LEARNING_SETTINGS: EvaFileType = {
  title: "EVAnalyzer AI Learning Settings",
  extension: ".ailearning.json",
  schemaFile: "ai_learning.schema.json",
  suggestedName: "classifier",
};

export const ALL_FILE_TYPES: EvaFileType[] = [PROJECT, PROJECT_TEMPLATE, MODULE_TEMPLATE, AI_LEARNING_SETTINGS];

export function fileTypeForFileName(fileName: string): EvaFileType | undefined {
  return ALL_FILE_TYPES.find((fileType) => fileName.endsWith(fileType.extension));
}
