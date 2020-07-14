import { RequestHandler, Response } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { RequestWithToken } from './token-middleware';
import { BodyValidator } from '../controller/policy';

/**
 * This class is responsible for:
 * - validating request models as middleware.
 */
export default class RequestValidatorMiddleware {
  /**
   * A reference to the Swagger specification that needs to be validated against.
   */
  private readonly specification: SwaggerSpecification;

  /**
   * The name of the Swagger model that needs to be validated against.
   */
  private readonly validator: BodyValidator;

  /**
   * Creates a new request model validator middleware instance.
   * @param validator - the validator properties.
   */
  public constructor(specification: SwaggerSpecification, validator: BodyValidator) {
    this.specification = specification;
    this.validator = validator;

    if (!specification.definitions[validator.modelName]) {
      throw new Error(`Model '${validator.modelName}' not defined.`);
    }
  }

  /**
   * Middleware handler for validating request models.
   * @param req - the express request to handle.
   * @param res - the express response object.
   * @param next - the express next function to continue processing of the request.
   */
  public async handle(req: RequestWithToken, res: Response, next: Function): Promise<void> {
    const result = this.specification.validateModel(
      this.validator.modelName,
      req.body,
      this.validator.allowBlankTarget,
      !this.validator.allowExtraProperties,
    );
    if (result.valid) {
      next();
      return;
    }

    res.status(400).json({
      valid: result.valid,
      errors: result.GetErrorMessages(),
    });
  }

  /**
   * @returns a middleware handler to be used by express.
   */
  public getMiddleware(): RequestHandler {
    return this.handle.bind(this);
  }
}
