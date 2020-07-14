import { RequestHandler, Response } from 'express';
import { PolicyImplementation } from '../controller/policy';
import { RequestWithToken } from './token-middleware';

/**
 * This class is responsible for:
 * - enforcing a given policy implementation as middleware.
 */
export default class PolicyMiddleware {
  /**
   * A reference to the policy to be used by this middleware instance.
   */
  private readonly policy: PolicyImplementation;

  /**
   * Creates a new policy middleware instance.
   * @param policy - the policy to be used by this middleware.
   */
  public constructor(policy: PolicyImplementation) {
    this.policy = policy;
  }

  /**
   * Middleware handler for enforcing the policy.
   * @param req - the express request to handle.
   * @param res - the express response object.
   * @param next - the express next function to continue processing of the request.
   */
  public async handle(req: RequestWithToken, res: Response, next: Function): Promise<void> {
    if (await this.policy(req)) {
      next();
      return;
    }

    res.status(403).end('You have insufficient permissions for the requested action.');
  }

  /**
   * @returns a middleware handler to be used by express.
   */
  public getMiddleware(): RequestHandler {
    return this.handle.bind(this);
  }
}
