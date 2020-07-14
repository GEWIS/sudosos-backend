import { RequestHandler } from 'express';
import { RequestWithToken } from '../middleware/token-middleware';

/**
 * A custom type defining all supported HTTP methods.
 */
export type Method = 'POST' | 'GET' | 'PATCH' | 'DELETE';

/**
 * The BodyValidator interface represents the Swagger model validation that is performed on the
 * HTTP request body.
 */
export interface BodyValidator {
  /**
   * The name of the Swagger model against which validation will happen.
   */
  modelName: string,
  /**
   * Whether or not an empty body should pass the validation.
   */
  allowBlankTarget?: boolean,
  /**
   * Whether or not properties not defined in the original model are allowed in the body.
   */
  allowExtraProperties?: boolean,
}

/**
 * The PolicyImplementation interface represents a function that determines if the given request
 * is allowed to execute the handler. If this is not allowed, the function must return false.
 * This policy is wrappable in a PolicyMiddleware.
 */
export interface PolicyImplementation {
  (req: RequestWithToken): Promise<boolean>;
}

/**
 * The MethodPolicy interface represents a single HTTP method of a route
 */
export interface MethodPolicy {
  /**
   * The body validator for this method.
   */
  body?: BodyValidator,
  /**
   * The policy which represents authorization for this method.
   */
  policy: PolicyImplementation,
  /**
   * The request handler to be executed if the policy passes.
   */
  handler: RequestHandler
}

/**
 * The RoutePolicy interface represents all route definitions of a router. These definitions include
 * the authorization middleware and handler function definitions.
 */
export type RoutePolicy = {
  /**
   * A mapping in the form: (method) => MethodPolicy
   */
  [method in Method]?: MethodPolicy;
};

/**
 * The Policy interface represents all route definitions of a router. These definitions include
 * the authorization middleware and handler function definitions.
 */
export default interface Policy {
  /**
   * A mapping in the form: (route) => RoutePolicy
   */
  [route: string]: RoutePolicy;
}
