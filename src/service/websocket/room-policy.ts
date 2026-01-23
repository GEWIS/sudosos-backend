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

import User from '../../entity/user/user';
import JsonWebToken from '../../authentication/json-web-token';
import { ParsedRoom, matchesRoomPattern } from './room-authorization';

/**
 * WebSocket request context similar to RequestWithToken but for WebSocket connections.
 */
export interface WebSocketRequestContext {
  user: User;
  token: JsonWebToken;
  room: string;
  parsedRoom?: ParsedRoom;
}

/**
 * Policy function for room authorization.
 * Similar to PolicyImplementation but for WebSocket rooms.
 */
export type RoomPolicy = (context: WebSocketRequestContext) => Promise<boolean>;

/**
 * Room registration with its policy.
 */
export interface RoomRegistration {
  /**
   * Room pattern (e.g., "pos:{id}:transactions" or exact match like "system").
   * Supports patterns with {id} placeholder. This is for human readability.
   */
  pattern: string;
  /**
   * Policy function that determines if a user can subscribe to this room.
   */
  policy: RoomPolicy;
}

/**
 * Registry for room policies.
 */
export class RoomPolicyRegistry {
  private registrations: RoomRegistration[] = [];

  /**
   * Registers a room with its policy.
   * @param registration - The room registration.
   */
  register(registration: RoomRegistration): void {
    this.registrations.push(registration);
  }

  /**
   * Finds a room registration that matches the given room name.
   * @param room - The room name to match.
   * @returns The matching registration or undefined.
   */
  findRegistration(room: string): RoomRegistration | undefined {
    return this.registrations.find(reg => matchesRoomPattern(reg.pattern, room));
  }
}
