declare module 'swagger-model-validator' {

  export interface ValidationResult {
    valid: boolean;
    errorCount: number;
    errors?: {
      name: string;
      message: string
    }[],
    GetErrorMessages: () => string[],
    GetFormattedErrors: () => object[]
  }

  export interface SwaggerSpecification {
    definitions: any;
    validateModel(
      modelName: string,
      object: object,
      allowBlankTarget?: boolean,
      disallowExtraProperties?: boolean
    ): ValidationResult;
  }

  export default class Validator {
    constructor(swaggerSpec: object);

    validate(
      object: object,
      swaggerModel: string,
      swaggerModels: object,
      allowBlankTarget?: boolean,
      disallowExtraProperties?: boolean
    ): ValidationResult;
  }
}
