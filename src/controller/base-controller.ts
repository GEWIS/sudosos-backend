import express, { Router, RequestHandler } from 'express';
import Policy, { MethodPolicy } from './policy';
import PolicyMiddleware from '../middleware/policy-middleware';

/**
 * The BaseController class is responsible for:
 * - Storing route definitions.
 * - Generating router objects based on the policy.
 */
export default abstract class BaseController {
  /**
   * The express router used by this controller.
   */
  private router: Router;

  /**
   * Defines a new route on the router. Private helper function to reduce code duplication.
   * @param route The route string.
   * @param methodPolicy The policy which should be added to the router.
   * @param callback The addition function of the appropiate method of the router.
   */
  private static defineRoute(
    route: string,
    methodPolicy: MethodPolicy,
    callback: (route: string, middleware: RequestHandler, handler: RequestHandler) => void,
  ) {
    callback(
      route,
      new PolicyMiddleware(methodPolicy.policy).getMiddleware(),
      methodPolicy.handler,
    );
  }

  /**
   * Creates a new controller instance, and generates the router based on its defined policy.
   */
  public constructor() {
    this.router = express.Router({ strict: true });

    // Generate routes based on the policy
    const policy = this.getPolicy();
    Object.keys(policy).forEach((route: string) => {
      const routePolicy = policy[route];
      if (routePolicy.GET) {
        BaseController.defineRoute(route, routePolicy.GET, this.router.get.bind(this.router));
      }
      if (routePolicy.POST) {
        BaseController.defineRoute(route, routePolicy.POST, this.router.post.bind(this.router));
      }
      if (routePolicy.PATCH) {
        BaseController.defineRoute(route, routePolicy.PATCH, this.router.patch.bind(this.router));
      }
      if (routePolicy.DELETE) {
        BaseController.defineRoute(route, routePolicy.DELETE, this.router.delete.bind(this.router));
      }
    });

    // If the request is not handled by the above handlers, the method is not supported.
    Object.keys(policy).forEach((route: string) => {
      this.router.use(route, (_req, res) => res.status(405).end('Method not allowed.'));
    });
  }

  /**
   * Gets the policy defined by child classes. This policy includes all routes that the controller
   * accepts, the authorization middleware, and the final handler function for every route.
   * @returns The policy of this controller.
   */
  public abstract getPolicy(): Policy;

  /**
   * @returns the router used by this controller.
   */
  public getRouter(): Router {
    return this.router;
  }
}
