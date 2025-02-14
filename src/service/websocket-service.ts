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


import http from 'http';
import express from 'express';
import WebSocket from 'ws';
import log4js, { Logger } from 'log4js';

/**
 * This is the module page of the websocket-service.
 *
 * @module websocket
 */

export default class WebSocketService {
  private static readonly httpServer = http.createServer(express());

  private static webSocketServer = new WebSocket.Server({ server: this.httpServer });
    
  public static initiateWebSocket(): void {
    const logger: Logger = log4js.getLogger('LDAP');
    logger.level = process.env.LOG_LEVEL;

    const port = process.env.WEBSOCKET_PORT || 443;
    this.httpServer.listen(port);
    logger.info('Opened WebSocket server on port ' + port);

    this.webSocketServer.on('maintenance-mode', (status) => {
      this.webSocketServer.clients.forEach((client) => {
        const message = 'maintenance-mode ' + status;
        client.send(message);
        logger.info('Sent \"' + message + '\" over WebSocket');
      });
    });
  }

  public static sendMaintenanceMode(enabled: boolean): void {
    this.webSocketServer.emit('maintenance-mode', enabled);
  }
}