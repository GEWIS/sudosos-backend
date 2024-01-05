/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import Mailer from '../mailer';
import HelloWorld from '../mailer/templates/hello-world';

export default class TestController extends BaseController {
  /**
   * Reference to the logger instance.
   */
  private logger: Logger = log4js.getLogger('TestController');

  /**
   * Creates a new test controller instance.
   * @param options - The options passed to the base controller.
   */
  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  /**
   * @inheritDoc
   */
  public getPolicy(): Policy {
    return {
      '/helloworld': {
        POST: {
          policy: async () => Promise.resolve(true),
          handler: this.helloWorld.bind(this),
        },
      },
    };
  }

  /**
   * POST /test/helloworld
   * @summary Get a beautiful Hello World email to your inbox
   * @operationId helloworld
   * @tags test- Operations of the test controller
   * @security JWT
   * @return 204 - Success
   * @return {string} 500 - Internal server error
   */
  public async helloWorld(req: RequestWithToken, res: Response): Promise<void> {
    this.logger.trace('Hello world email by', req.token.user.id);

    try {
      await Mailer.getInstance().send(req.token.user,
        new HelloWorld({ name: req.token.user.firstName }));
      res.status(204).send();
    } catch (e) {
      res.status(500).json('Internal server error.');
    }
  }
}
