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

import log4js from 'log4js';
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

  public static readonly SERVER = createServer();

  public static readonly IO = new Server(this.SERVER);

  public static readonly LOGGER = log4js.getLogger('WebSocket');

  public static initiateWebSocket(): void {
    this.LOGGER.level = process.env.LOG_LEVEL;

    if (process.env.NODE_ENV == 'production') {
      this.IO.adapter(createAdapter());

      setupWorker(this.IO);
    } else {
      const port = 8080;

      this.SERVER.listen(port, () => {
        this.LOGGER.info(`WebSocket opened on port ${port}.`);
      });
    }

    this.IO.on('connection', client => {
      this.LOGGER.info(`Client ${client.id} connected.`);

      client.on('subscribe', room => {
        this.LOGGER.info(`Client ${client.id} is joining room ${room}`);
        void client.join(room);
      });

      client.on('unsubscribe', room => {
        this.LOGGER.info(`Client ${client.id} is leaving room ${room}`);
        void client.leave(room);
      });
    });
  }

  public static sendMaintenanceMode(enabled: boolean): void {
    this.LOGGER.info('Set maintenance mode to ' + enabled);
    this.IO.sockets.in('maintenance').emit('maintenance-mode', enabled);
  }
}