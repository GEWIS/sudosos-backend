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
import ServerSettingsStore from '../server-settings/server-settings-store';

const SYSTEM_ROOM = 'system';
const WEBSOCKET_PORT = 8080;

/**
 * This is the module page of the websocket-service.
 *
 * @module websocket
 */
export default class WebSocketService {

  public static readonly server = createServer();

  public static readonly io = new Server(this.server);

  public static readonly logger = log4js.getLogger('WebSocket');

  private static setupAdapter(): void {
    this.io.adapter(createAdapter());
    setupWorker(this.io);
  }

  public static initiateWebSocket(): void {
    this.logger.level = process.env.LOG_LEVEL;

    if (process.env.NODE_ENV == 'production') {
      this.setupAdapter();
    } else {
      const port = WEBSOCKET_PORT;

      this.server.listen(port, () => {
        this.logger.info(`WebSocket opened on port ${port}.`);
      });
    }

    this.io.on('connection', client => {
      this.logger.trace(`Client ${client.id} connected.`);

      client.on('subscribe', async room => {
        this.logger.trace(`Client ${client.id} is joining room ${room}`);
        void client.join(room);

        if (room === SYSTEM_ROOM) {
          try {
            const maintenanceMode = await ServerSettingsStore.getInstance().getSettingFromDatabase('maintenanceMode') as boolean;
            WebSocketService.sendMaintenanceMode(maintenanceMode);
          } catch (error) {
            this.logger.error(`Failed to retrieve maintenance mode setting: ${error}`);
          }
        }
      });

      client.on('unsubscribe', room => {
        this.logger.trace(`Client ${client.id} is leaving room ${room}`);
        void client.leave(room);
      });
    });
  }

  public static sendMaintenanceMode(enabled: boolean): void {
    this.logger.info(`Sent maintenance mode ${enabled} to ${SYSTEM_ROOM}`);
    this.io.sockets.in(SYSTEM_ROOM).emit('maintenance-mode', enabled);
  }
}