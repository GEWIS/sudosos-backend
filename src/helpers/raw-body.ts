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
 * This is the module page of the raw-body.
 *
 * @module internal/helpers
 */

import { IncomingMessage, ServerResponse } from 'http';
import { Request } from 'express';

/**
 * Extend the Express Request object with a raw body attribute, which is used by Stripe
 * to validate incoming events
 */
export interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

/**
 * Put the raw, unparsed body also in the request object
 * @param req
 * @param res
 * @param buf
 */
export function extractRawBody(req: IncomingMessage, res: ServerResponse, buf: Buffer) {
  // @ts-ignore
  req.rawBody = buf;
}
