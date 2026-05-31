export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  public constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class MissingGenerationDependencyError extends ApiError {
  public constructor(message: string) {
    super(message, 409, "MISSING_GENERATION_DEPENDENCY");
    this.name = "MissingGenerationDependencyError";
  }
}
