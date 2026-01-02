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

import { expect } from 'chai';
import sinon from 'sinon';
import { io } from 'socket.io-client';
import WebSocketService from '../../../src/service/websocket-service';
import ServerSettingsStore from '../../../src/server-settings/server-settings-store';

describe('WebSocketService', () => {
  const ORIGINAL_ENV = process.env;
  let ioEmitSpy: sinon.SinonSpy;
  let loggerInfoSpy: sinon.SinonSpy;
  let loggerTraceSpy: sinon.SinonSpy;
  let loggerErrorSpy: sinon.SinonSpy;
  let serverSettingsMock: any;
  let clientSocket: any;
  let spies: sinon.SinonSpy[];
  let getInstanceStub: sinon.SinonStub;

  before(() => {
    // Save original process.env and set test environment
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'development',
    };

    // Setup spies before initialization
    ioEmitSpy = sinon.spy(WebSocketService.io.sockets, 'emit');
    loggerInfoSpy = sinon.spy(WebSocketService.logger, 'info');
    loggerTraceSpy = sinon.spy(WebSocketService.logger, 'trace');
    loggerErrorSpy = sinon.spy(WebSocketService.logger, 'error');
    spies = [ioEmitSpy, loggerInfoSpy, loggerTraceSpy, loggerErrorSpy];

    // Create a mock for ServerSettingsStore
    serverSettingsMock = {
      getSettingFromDatabase: sinon.stub(),
    };

    // Mock the getInstance method to return our mock
    getInstanceStub = sinon.stub(ServerSettingsStore, 'getInstance').returns(serverSettingsMock);

    // Initialize WebSocket service
    WebSocketService.initiateWebSocket();
  });

  beforeEach(() => {
    // Connect a client before each test
    clientSocket = io('http://localhost:8080');

    // Reset mocks before each test
    serverSettingsMock.getSettingFromDatabase.reset();
  });

  afterEach(() => {
    // Disconnect client and reset spies after each test
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    spies.forEach((spy) => spy.resetHistory());
  });

  after(() => {
    // Clean up all resources
    WebSocketService.server.close();
    spies.forEach((spy) => spy.restore());
    getInstanceStub.restore();
    process.env = ORIGINAL_ENV;
  });

  describe('initiateWebSocket function', () => {
    it('should start server on port 8080', () => {
      expect(WebSocketService.server.listening).to.be.true;
      expect(loggerInfoSpy.calledWith('WebSocket opened on port 8080.')).to.be.true;
    });

    it('should handle client connection', (done) => {
      clientSocket.on('connect', () => {
        expect(loggerTraceSpy.calledWith(`Client ${clientSocket.id} connected.`)).to.be.true;
        done();
      });
    });
  });

  describe('client room subscription', () => {
    it('should allow clients to subscribe to rooms', (done) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'testRoom');

        setTimeout(() => {
          expect(loggerTraceSpy.calledWith(`Client ${clientSocket.id} is joining room testRoom`)).to.be.true;
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
            expect(loggerTraceSpy.calledWith(`Client ${clientSocket.id} is leaving room testRoom`)).to.be.true;
            done();
          }, 100);
        }, 100);
      });
    });

    it('should send current maintenance mode status when client subscribes to system room', (done) => {
      // Configure ServerSettingsStore mock to return 'true' for maintenance mode
      serverSettingsMock.getSettingFromDatabase.withArgs('maintenanceMode').resolves(true);

      clientSocket.on('connect', () => {
        // Set up listener for maintenance-mode event before subscribing
        clientSocket.on('maintenance-mode', (status: boolean) => {
          expect(status).to.equal(true);
          expect(serverSettingsMock.getSettingFromDatabase.calledWith('maintenanceMode')).to.be.true;
          expect(loggerInfoSpy.calledWith('Sent maintenance mode true to system')).to.be.true;
          done();
        });

        // Subscribe to system room
        clientSocket.emit('subscribe', 'system');
      });
    });

    it('should handle errors when retrieving maintenance mode status', (done) => {
      // Configure ServerSettingsStore mock to throw an error
      const testError = new Error('Database connection failed');
      serverSettingsMock.getSettingFromDatabase.withArgs('maintenanceMode').rejects(testError);

      clientSocket.on('connect', () => {
        // Subscribe to system room
        clientSocket.emit('subscribe', 'system');

        // Give some time for the async operation to complete
        setTimeout(() => {
          expect(serverSettingsMock.getSettingFromDatabase.calledWith('maintenanceMode')).to.be.true;
          expect(loggerErrorSpy.calledWith(`Failed to retrieve maintenance mode setting: ${testError}`)).to.be.true;
          done();
        }, 200);
      });
    });
  });

  describe('sendMaintenanceMode function', () => {
    it('should emit maintenance-mode event to subscribed clients', (done) => {
      // Configure ServerSettingsStore mock to return 'true' for maintenance mode
      serverSettingsMock.getSettingFromDatabase.withArgs('maintenanceMode').resolves(true);

      clientSocket.on('connect', () => {
        // Subscribe to maintenance room
        clientSocket.emit('subscribe', 'system');

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
      expect(loggerInfoSpy.calledWith('Sent maintenance mode false to system')).to.be.true;
    });
  });

  describe('environment handling', () => {
    let setupAdapterStub: sinon.SinonStub;

    before(() => {
      // Stub the setupAdapter method to prevent it from executing its production logic
      // @ts-ignore to allow access to the private method
      setupAdapterStub = sinon.stub(WebSocketService as any, 'setupAdapter').returns(undefined);
    });

    after(() => {
      // Restore the original setupAdapter method
      setupAdapterStub.restore();
    });

    it('should call setupAdapter if NODE_ENV is set to production', () => {
      // Save and change NODE_ENV to production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Initiate the WebSocket
      WebSocketService.initiateWebSocket();

      // Verify setupAdapter was called
      expect(setupAdapterStub.calledOnce).to.be.true;

      // Restore NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });
  });
});