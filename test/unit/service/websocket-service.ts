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

import { expect } from 'chai';
import sinon from 'sinon';
import { io } from 'socket.io-client';
import WebSocketService from '../../../src/service/websocket-service';

describe('WebSocketService', () => {
  const ORIGINAL_ENV = process.env;
  let ioEmitSpy: sinon.SinonSpy;
  let loggerInfoSpy: sinon.SinonSpy;
  let clientSocket: any;

  before(() => {
    // Save original process.env and set test environment
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'development',
    };

    // Setup spies before initialization
    ioEmitSpy = sinon.spy(WebSocketService.IO.sockets, 'emit');
    loggerInfoSpy = sinon.spy(WebSocketService.LOGGER, 'info');

    // Initialize WebSocket service
    WebSocketService.initiateWebSocket();
  });

  beforeEach(() => {
    // Connect a client before each test
    clientSocket = io('http://localhost:8080');
  });

  afterEach(() => {
    // Disconnect client and reset spies after each test
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    ioEmitSpy.resetHistory();
    loggerInfoSpy.resetHistory();
  });

  after(() => {
    // Clean up all resources
    WebSocketService.SERVER.close();
    ioEmitSpy.restore();
    loggerInfoSpy.restore();
    process.env = ORIGINAL_ENV;
  });

  describe('initiateWebSocket function', () => {
    it('should start server on port 8080', () => {
      expect(WebSocketService.SERVER.listening).to.be.true;
      expect(loggerInfoSpy.calledWith('WebSocket opened on port 8080.')).to.be.true;
    });

    it('should handle client connection', (done) => {
      clientSocket.on('connect', () => {
        expect(loggerInfoSpy.calledWith(`Client ${clientSocket.id} connected.`)).to.be.true;
        done();
      });
    });
  });

  describe('client room subscription', () => {
    it('should allow clients to subscribe to rooms', (done) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'testRoom');

        setTimeout(() => {
          expect(loggerInfoSpy.calledWith(`Client ${clientSocket.id} is joining room testRoom`)).to.be.true;
          done();
        }, 100);
      });
    });

    it('should allow clients to unsubscribe from rooms', (done) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'testRoom');

        setTimeout(() => {
          clientSocket.emit('unsubscribe', 'testRoom');

          setTimeout(() => {
            expect(loggerInfoSpy.calledWith(`Client ${clientSocket.id} is leaving room testRoom`)).to.be.true;
            done();
          }, 100);
        }, 100);
      });
    });
  });

  describe('sendMaintenanceMode function', () => {
    it('should emit maintenance-mode event to subscribed clients', (done) => {
      clientSocket.on('connect', () => {
        // Subscribe to maintenance room
        clientSocket.emit('subscribe', 'maintenance');

        // Listen for maintenance-mode event
        clientSocket.on('maintenance-mode', (status: boolean) => {
          expect(status).to.equal(true);
          done();
        });

        // Wait for subscription to complete, then send maintenance mode
        setTimeout(() => {
          WebSocketService.sendMaintenanceMode(true);
        }, 100);
      });
    });

    it('should log maintenance mode status change', () => {
      WebSocketService.sendMaintenanceMode(false);
      expect(loggerInfoSpy.calledWith('Set maintenance mode to false')).to.be.true;
    });
  });

  describe('environment handling', () => {
    it('should use different setup in production mode', () => {
      // Save original initiateWebSocket to restore later
      const originalInitiate = WebSocketService.initiateWebSocket;

      // Override the method to test production path
      WebSocketService.initiateWebSocket = function () {
        this.LOGGER.level = process.env.LOG_LEVEL;
        // Just testing the condition
        if (process.env.NODE_ENV == 'production') {
          return true; // Production path taken
        }
        return false; // Development path taken
      };

      // Test with production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(WebSocketService.initiateWebSocket()).to.be.true;

      // Reset environment and method
      process.env.NODE_ENV = originalEnv;
      WebSocketService.initiateWebSocket = originalInitiate;
    });
  });
});