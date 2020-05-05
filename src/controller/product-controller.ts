import { Response } from 'express';
import BaseController from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';

export default class ProductController extends BaseController {
  /**
   * @inheritdoc
   */
  // eslint-disable-next-line class-methods-use-this
  public getPolicy(): Policy {
    return {
      '/': {
        POST: {
          policy: ProductController.canCreateProduct,
          handler: ProductController.createProduct,
        },
      },
    };
  }

  public static async canCreateProduct(req: RequestWithToken): Promise<boolean> {
    return false;
  }

  public static async createProduct(req: RequestWithToken, res: Response): Promise<void> {
    res.status(500).json('Not implemented.');
  }
}
