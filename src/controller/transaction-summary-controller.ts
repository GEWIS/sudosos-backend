/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
 *
 *  @license
 */

/**
 * This is the module page of the transaction summaries.
 * Not that this module has been created in very strict time constraints,
 * so its implementation is very minimal.
 * https://github.com/GEWIS/sudosos-backend/pull/415
 *
 * @module transaction-summaries
 */

import { Response } from 'express';
import log4js, { Logger } from 'log4js';
import BaseController, { BaseControllerOptions } from './base-controller';
import Policy from './policy';
import { RequestWithToken } from '../middleware/token-middleware';
import TransactionSummaryService from '../service/transaction-summary-service';
import { ContainerSummaryResponse } from './response/transaction-summary-response';

export default class TransactionSummaryController extends BaseController {
  private logger: Logger = log4js.getLogger('TransactionSummaryController');

  public constructor(options: BaseControllerOptions) {
    super(options);
    this.logger.level = process.env.LOG_LEVEL;
  }

  public getPolicy(): Policy {
    return {
      '/container/:id(\\d+)': {
        GET: {
          policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Transaction', ['*']),
          handler: this.getSingleContainerSummary.bind(this),
        },
      },
    };
  }

  /**
   * GET /transactions/summary/container/{id}
   * @summary Returns a summary of all purchases within a container
   * @operationId getSingleContainerSummary
   * @tags transactionSummaries - Operations of the transaction summary controller
   * @security JWT
   * @deprecated - Hotfix for Feestcafé "De BAC" - 70s Disco Edition. Do not use for anything else. https://github.com/GEWIS/sudosos-backend/pull/415
   * @param {integer} id.path.required - The ID of the container
   * @return {Array<ContainerSummaryResponse>} 200 - The requested summary
   * @return {string} 404 - Not found error
   * @return {string} 500 - Internal server error
   */
  public async getSingleContainerSummary(req: RequestWithToken, res: Response): Promise<void> {
    const { id: rawId } = req.params;
    this.logger.trace('Get single container summary of container', rawId, ', by user', req.token.user);

    try {
      const id = Number(rawId);
      const { summaries, totals } = await new TransactionSummaryService().getContainerSummary({ containerId: id });
      if (summaries.length === 0) {
        // This also causes a 404 if the container exists, but no transactions have been made.
        // However, this is a won't fix for now (because time)
        // https://github.com/GEWIS/sudosos-backend/pull/415
        res.status(404).json('Container not found.');
        return;
      }

      const records = summaries.map((s) => TransactionSummaryService.toContainerSummaryRecord(s));
      const response: ContainerSummaryResponse = {
        summaries: records,
        totalInclVat: totals.totalInclVat.toObject(),
        amountOfProducts: totals.amountOfProducts,
      };

      res.status(200).json(response);
    } catch (e) {
      res.status(500).send('Internal server error.');
      this.logger.error(e);
    }
  }
}
