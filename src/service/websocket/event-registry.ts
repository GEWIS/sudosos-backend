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

import { EventGuard } from './event-guards';

/**
 * Resolved room information from event data.
 */
export interface ResolvedRoom {
  /**
   * The room name (e.g., "pos:123:transactions").
   */
  roomName: string;
  /**
   * The entity ID extracted from event data, or null for global rooms.
   */
  entityId: number | null;
}

/**
 * Resolver function that extracts all potential room information from event data.
 * Returns an array of all rooms that this event could potentially be emitted to.
 * The guard will then filter which rooms actually receive the event.
 * @param eventData - The event data.
 * @returns Array of resolved rooms, or empty array if no rooms match.
 */
export type RoomResolver<T = any> = (eventData: T) => ResolvedRoom[];

/**
 * Event handler configuration for a specific event type.
 */
export interface EventHandler<T = any> {
  /**
   * Resolver function that extracts all potential rooms from event data.
   * Should return all possible rooms that could receive this event.
   */
  resolver: RoomResolver<T>;
  /**
   * Guard function that filters which rooms should actually receive the event.
   * Only called for rooms returned by the resolver.
   */
  guard: EventGuard<T>;
}

/**
 * Registry for event types and their handlers.
 */
export class EventRegistry {
  private handlers = new Map<string, EventHandler>();

  /**
   * Registers an event type with its handler.
   * @param eventType - The event type (e.g., "transaction:created").
   * @param handler - The event handler configuration.
   */
  register<T>(eventType: string, handler: EventHandler<T>): void {
    this.handlers.set(eventType, handler);
  }

  /**
   * Gets the handler for an event type.
   * @param eventType - The event type.
   * @returns The handler or undefined if not registered.
   */
  getHandler(eventType: string): EventHandler | undefined {
    return this.handlers.get(eventType);
  }
}
