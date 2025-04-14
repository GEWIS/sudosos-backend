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

import log4js, { Logger } from 'log4js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/cluster-adapter';
import { setupWorker } from '@socket.io/sticky';

/**
 * This is the module page of the websocket-service.
 *
 * @module websocket
 */

export default class WebSocketService {

  private static readonly SERVER = createServer();

  private static readonly IO = new Server(this.SERVER);

  public static initiateWebSocket(): void {
    const logger: Logger = log4js.getLogger('WebSocket');
    logger.level = process.env.LOG_LEVEL;

    if (process.env.NODE_ENV == 'production') {
      this.IO.adapter(createAdapter());

      setupWorker(this.IO);
    } else {
      this.SERVER.listen(8080, () => {
        logger.info('WebSocket opened on port ' + 8080 + '.');
      });
    }

    this.IO.on('connection', (socket) => {
      logger.info(`connect ${socket.id}`);
    });
  }

  public static sendMaintenanceMode(enabled: boolean): void {
    const logger: Logger = log4js.getLogger('WebSocket');
    logger.level = process.env.LOG_LEVEL;
    logger.info('Set maintenance mode to ' + enabled);
    this.IO.emit('maintenance-mode', enabled);
  }
}