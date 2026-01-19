/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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
import QRAuthenticator from '../entity/authenticator/qr-authenticator';
import AuthenticationResponse from '../controller/response/authentication-response';

const SYSTEM_ROOM = 'system';

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
      const port = process.env.WEBSOCKET_PORT ? parseInt(process.env.WEBSOCKET_PORT, 10) : 8080;

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

      client.on('subscribe-qr-session', sessionId => {
        this.logger.trace(`Client ${client.id} is subscribing to QR session ${sessionId}`);
        void client.join(`qr-session-${sessionId}`);
      });

      client.on('unsubscribe-qr-session', sessionId => {
        this.logger.trace(`Client ${client.id} is unsubscribing from QR session ${sessionId}`);
        void client.leave(`qr-session-${sessionId}`);
      });
    });
  }

  public static emitQRConfirmed(qr: QRAuthenticator, token: AuthenticationResponse): void {
    // Only log non-sensitive token properties (e.g., userId) instead of the full token object
    this.logger.info(`Emitting QR confirmed for session ${qr.sessionId}, userId: ${token.user.id ?? 'unknown'}`);
    this.io.to(`qr-session-${qr.sessionId}`).emit('qr-confirmed', {
      sessionId: qr.sessionId,
      token,
    });
  }

  public static sendMaintenanceMode(enabled: boolean): void {
    this.logger.info(`Sent maintenance mode ${enabled} to ${SYSTEM_ROOM}`);
    this.io.sockets.in(SYSTEM_ROOM).emit('maintenance-mode', enabled);
  }
}