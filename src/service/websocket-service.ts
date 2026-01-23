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
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/cluster-adapter';
import { setupWorker } from '@socket.io/sticky';
import ServerSettingsStore from '../server-settings/server-settings-store';
import QRAuthenticator from '../entity/authenticator/qr-authenticator';
import AuthenticationResponse from '../controller/response/authentication-response';
import TokenHandler from '../authentication/token-handler';
import JsonWebToken from '../authentication/json-web-token';
import User from '../entity/user/user';
import { TransactionResponse } from '../controller/response/transaction-response';
import { parseRoom } from './websocket/room-authorization';
import {
  RoomPolicyRegistry,
  RoomRegistration,
  WebSocketRequestContext,
} from './websocket/room-policy';
import { InPosGuard, GlobalGuard } from './websocket/event-guards';
import { EventRegistry, ResolvedRoom } from './websocket/event-registry';
import { getPointOfSaleRelation } from './websocket/pos-relation-helper';
import RoleManager from '../rbac/role-manager';

const SYSTEM_ROOM = 'system';

interface SocketData {
  user: User;
  token: JsonWebToken;
}

/**
 * Options for WebSocketService constructor.
 */
export interface WebSocketServiceOptions {
  tokenHandler: TokenHandler;
  roleManager: RoleManager;
}

/**
 * This is the module page of the websocket-service.
 *
 * @module websocket
 */
export default class WebSocketService {

  private static instance: WebSocketService | null = null;

  public readonly server = createServer();

  public readonly io = new Server(this.server);

  public readonly logger = log4js.getLogger('WebSocket');

  private readonly tokenHandler: TokenHandler;

  private readonly roleManager: RoleManager;

  private readonly roomPolicyRegistry: RoomPolicyRegistry = new RoomPolicyRegistry();

  private readonly eventRegistry: EventRegistry = new EventRegistry();

  /**
   * Creates a new WebSocketService instance.
   * @param options - The service options.
   */
  constructor(options: WebSocketServiceOptions) {
    this.tokenHandler = options.tokenHandler;
    this.roleManager = options.roleManager;
    this.logger.level = process.env.LOG_LEVEL;
    this.initializeRoomsAndHandlers();
    WebSocketService.instance = this;
  }

  /**
   * Gets the singleton instance of WebSocketService.
   * @returns The WebSocketService instance.
   * @throws Error if WebSocketService has not been initialized.
   */
  public static getInstance(): WebSocketService {
    if (!this.instance) {
      throw new Error('WebSocketService has not been initialized. Create an instance first using: new WebSocketService({ tokenHandler, roleManager })');
    }
    return this.instance;
  }

  /**
   * Static getter for backward compatibility with tests.
   * @returns The Socket.IO server instance.
   * @throws Error if WebSocketService has not been initialized.
   */
  public static get io(): Server {
    return this.getInstance().io;
  }

  /**
   * Static getter for backward compatibility with tests.
   * @returns The logger instance.
   * @throws Error if WebSocketService has not been initialized.
   */
  public static get logger(): log4js.Logger {
    return this.getInstance().logger;
  }

  /**
   * Static getter for backward compatibility with tests.
   * @returns The HTTP server instance.
   * @throws Error if WebSocketService has not been initialized.
   */
  public static get server(): ReturnType<typeof createServer> {
    return this.getInstance().server;
  }

  /**
   * Static method for backward compatibility with tests.
   * Delegates to the singleton instance.
   * @throws Error if WebSocketService has not been initialized.
   */
  public static initiateWebSocket(): void {
    this.getInstance().initiateWebSocket();
  }

  /**
   * Sets up the cluster adapter for production environments.
   */
  private setupAdapter(): void {
    this.io.adapter(createAdapter());
    setupWorker(this.io);
  }

  /**
   * Initializes room registrations and event handlers.
   */
  private initializeRoomsAndHandlers(): void {
    // Register POS transaction rooms
    this.registerRoom({
      pattern: 'pos:{id}:transactions',
      policy: async (context) => {
        const posId = context.parsedRoom?.entityId;
        if (!posId) return false;
        
        const relation = await getPointOfSaleRelation(
          context.user.id,
          context.token,
          posId,
        );
        return this.roleManager.can(
          context.token.roles,
          'get',
          relation,
          'Transaction',
          ['*'],
        );
      },
    });


    // Register transaction:created event handler
    this.eventRegistry.register<TransactionResponse>('transaction:created', {
      resolver: (transaction) => {
        const rooms: ResolvedRoom[] = [];
        
        if (transaction.pointOfSale?.id) {
          rooms.push({
            roomName: `pos:${transaction.pointOfSale.id}:transactions`,
            entityId: transaction.pointOfSale.id,
          });
        }

        rooms.push({
          roomName: 'transactions:all',
          entityId: null,
        });

        return rooms;
      },
      guard: async (transaction, roomContext) => {
        if (roomContext.isGlobal) {
          return GlobalGuard(transaction, roomContext);
        }

        if (roomContext.entityType === 'pos') {
          return InPosGuard(transaction, roomContext);
        }

        return false;
      },
    });
  }

  /**
   * Registers a room with its policy.
   * @param registration - The room registration.
   */
  public registerRoom(registration: RoomRegistration): void {
    // Validate pattern can be parsed (for patterns with {id}, this ensures they're valid)
    const parsedPattern = parseRoom(registration.pattern);
    if (!parsedPattern && registration.pattern !== 'system') {
      this.logger.warn(`Failed to parse room pattern: ${registration.pattern}`);
      return;
    }

    this.roomPolicyRegistry.register(registration);
  }

  /**
   * Initializes the WebSocket server and sets up connection handlers.
   */
  public initiateWebSocket(): void {
    if (process.env.NODE_ENV == 'production') {
      this.setupAdapter();
    } else {
      const port = process.env.WEBSOCKET_PORT ? parseInt(process.env.WEBSOCKET_PORT, 10) : 8080;

      this.server.listen(port, () => {
        this.logger.info(`WebSocket opened on port ${port}.`);
      });
    }

    this.io.on('connection', async (client: Socket) => {
      await this.handleAuthentication(client);
      this.setupConnectionHandlers(client);
    });
  }

  /**
   * Authenticates a client connection using the provided token.
   * @param client - The socket client to authenticate.
   */
  private async handleAuthentication(client: Socket): Promise<void> {
    const tokenQuery = client.handshake.query.token;
    // Normalize token: Socket.IO query params can be string | string[] | undefined
    const tokenString = Array.isArray(tokenQuery) ? tokenQuery[0] : tokenQuery;
    
    if (!tokenString || typeof tokenString !== 'string') {
      this.logger.trace(`Client ${client.id} connected without authentication`);
      return;
    }

    try {
      const token = await this.tokenHandler.verifyToken(tokenString);
      const user = await User.findOne({ 
        where: { id: token.user.id },
        relations: { pointOfSale: true },
      });

      if (user) {
        (client.data as SocketData).user = user;
        (client.data as SocketData).token = token;
        this.logger.trace(`Client ${client.id} connected and authenticated as user ${user.id}`);
      } else {
        this.logger.warn(`Client ${client.id} authenticated with invalid user ID: ${token.user.id}`);
      }
    } catch (error) {
      this.logger.trace(`Client ${client.id} provided token but authentication failed: ${error}`);
    }
  }

  /**
   * Sets up all event handlers for a client connection.
   * @param client - The socket client to set up handlers for.
   */
  private setupConnectionHandlers(client: Socket): void {
    client.on('subscribe', async (room: string) => {
      await this.handleSubscribe(client, room);
    });

    client.on('unsubscribe', (room: string) => {
      this.handleUnsubscribe(client, room);
    });

    client.on('subscribe-qr-session', (sessionId: string) => {
      this.handleQRSessionSubscribe(client, sessionId);
    });

    client.on('unsubscribe-qr-session', (sessionId: string) => {
      this.handleQRSessionUnsubscribe(client, sessionId);
    });
  }

  /**
   * Handles room subscription requests with authorization checks.
   * @param client - The socket client requesting subscription.
   * @param room - The room name to subscribe to.
   */
  private async handleSubscribe(client: Socket, room: string): Promise<void> {
    // Public rooms don't require authentication
    if (room === SYSTEM_ROOM) {
      this.logger.trace(`Client ${client.id} is joining room ${room}`);
      await client.join(room);
      await this.handleSystemRoomSubscription();
      return;
    }

    // Find room registration
    const registration = this.roomPolicyRegistry.findRegistration(room);
    
    if (!registration) {
      this.logger.warn(`Client ${client.id} attempted to subscribe to unregistered room: ${room}`);
      client.emit('error', { message: 'Room not found or not registered.' });
      return;
    }

    const socketData = client.data as SocketData;
    
    // Check if authentication is required (room has a policy)
    if (registration.policy) {
      if (!socketData.user || !socketData.token) {
        this.logger.warn(`Client ${client.id} attempted to subscribe to authenticated room ${room} without authentication`);
        client.emit('error', { message: 'Authentication required for this room.' });
        return;
      }

      // Parse room for context
      const parsedRoom = parseRoom(room);
      const context: WebSocketRequestContext = {
        user: socketData.user,
        token: socketData.token,
        room,
        parsedRoom: parsedRoom || undefined,
      };

      // Check policy
      const authorized = await registration.policy(context);
      if (!authorized) {
        this.logger.warn(`Client ${client.id} (user ${socketData.user.id}) failed policy check for room ${room}`);
        client.emit('error', { message: 'Unauthorized to subscribe to this room.' });
        return;
      }
    }

    this.logger.trace(`Client ${client.id} is joining room ${room}`);
    void client.join(room);
  }

  /**
   * Handles system room subscription by sending current maintenance mode status.
   */
  private async handleSystemRoomSubscription(): Promise<void> {
    try {
      const maintenanceMode = await ServerSettingsStore.getInstance().getSettingFromDatabase('maintenanceMode') as boolean;
      this.sendMaintenanceMode(maintenanceMode);
    } catch (error) {
      this.logger.error(`Failed to retrieve maintenance mode setting: ${error}`);
    }
  }

  /**
   * Handles room unsubscription requests.
   * @param client - The socket client requesting unsubscription.
   * @param room - The room name to unsubscribe from.
   */
  private handleUnsubscribe(client: Socket, room: string): void {
    this.logger.trace(`Client ${client.id} is leaving room ${room}`);
    void client.leave(room);
  }

  /**
   * Handles QR session subscription requests.
   * @param client - The socket client requesting subscription.
   * @param sessionId - The QR session ID to subscribe to.
   */
  private handleQRSessionSubscribe(client: Socket, sessionId: string): void {
    this.logger.trace(`Client ${client.id} is subscribing to QR session ${sessionId}`);
    void client.join(`qr-session-${sessionId}`);
  }

  /**
   * Handles QR session unsubscription requests.
   * @param client - The socket client requesting unsubscription.
   * @param sessionId - The QR session ID to unsubscribe from.
   */
  private handleQRSessionUnsubscribe(client: Socket, sessionId: string): void {
    this.logger.trace(`Client ${client.id} is unsubscribing from QR session ${sessionId}`);
    void client.leave(`qr-session-${sessionId}`);
  }

  /**
   * Emits a QR confirmation event to all clients subscribed to the QR session.
   * @param qr - The QR authenticator containing the session ID.
   * @param token - The authentication response token to send.
   */
  public emitQRConfirmed(qr: QRAuthenticator, token: AuthenticationResponse): void {
    this.logger.info(`Emitting QR confirmed for session ${qr.sessionId}, userId: ${token.user.id ?? 'unknown'}`);
    this.io.to(`qr-session-${qr.sessionId}`).emit('qr-confirmed', {
      sessionId: qr.sessionId,
      token,
    });
  }

  /**
   * Sends maintenance mode status to all clients in the system room.
   * @param enabled - Whether maintenance mode is enabled.
   */
  public sendMaintenanceMode(enabled: boolean): void {
    this.logger.info(`Sent maintenance mode ${enabled} to ${SYSTEM_ROOM}`);
    this.io.sockets.in(SYSTEM_ROOM).emit('maintenance-mode', enabled);
  }

  /**
   * Emits an event to the appropriate rooms using the event registry.
   * @param eventType - The event type (e.g., "transaction:created").
   * @param eventData - The event data to emit.
   */
  public async emit<T>(eventType: string, eventData: T): Promise<void> {
    const handler = this.eventRegistry.getHandler(eventType);
    if (!handler) {
      this.logger.warn(`No handler registered for event type: ${eventType}`);
      return;
    }

    const resolvedRooms = handler.resolver(eventData);
    const roomsToEmit = new Set<string>();

    for (const resolvedRoom of resolvedRooms) {
      const parsedRoom = parseRoom(resolvedRoom.roomName);
      if (!parsedRoom) {
        this.logger.warn(`Failed to parse room: ${resolvedRoom.roomName}`);
        continue;
      }

      if (await handler.guard(eventData, parsedRoom)) {
        roomsToEmit.add(resolvedRoom.roomName);
      }
    }

    this.logger.trace(`Emitting ${eventType} to rooms: ${Array.from(roomsToEmit).join(', ')}`);
    roomsToEmit.forEach(room => {
      this.io.to(room).emit(eventType, eventData);
    });
  }

  /**
   * Emits a transaction created event to the appropriate rooms.
   * @param transaction - The transaction response to emit.
   */
  public async emitTransactionCreated(transaction: TransactionResponse): Promise<void> {
    await this.emit('transaction:created', transaction);
  }

  /**
   * Static method for backward compatibility.
   * Delegates to the singleton instance.
   * @throws Error if WebSocketService has not been initialized.
   */
  public static emitQRConfirmed(qr: QRAuthenticator, token: AuthenticationResponse): void {
    this.getInstance().emitQRConfirmed(qr, token);
  }

  /**
   * Static method for backward compatibility.
   * Delegates to the singleton instance.
   * @throws Error if WebSocketService has not been initialized.
   */
  public static sendMaintenanceMode(enabled: boolean): void {
    this.getInstance().sendMaintenanceMode(enabled);
  }

  /**
   * Static method for backward compatibility.
   * Delegates to the singleton instance.
   * @throws Error if WebSocketService has not been initialized.
   */
  public static async emitTransactionCreated(transaction: TransactionResponse): Promise<void> {
    await this.getInstance().emitTransactionCreated(transaction);
  }
}