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

import { ParsedRoom } from './room-parser';

/**
 * Guard function that determines if an event should be emitted to a room.
 * @param eventData - The event data.
 * @param roomContext - The parsed room information.
 * @returns True if the event should be emitted to this room.
 */
export type EventGuard<T = any> = (eventData: T, roomContext: ParsedRoom) => boolean | Promise<boolean>;

/**
 * InPos guard checks if transaction belongs to the POS in the room.
 */
export const InPosGuard: EventGuard<{ pointOfSale?: { id?: number } }> = (eventData, roomContext) => {
  if (roomContext.entityType !== 'pos' || roomContext.entityId === null) {
    return false;
  }
  return eventData.pointOfSale?.id === roomContext.entityId;
};

/**
 * ForUser guard checks if transaction belongs to the user in the room.
 */
export const ForUserGuard: EventGuard<{ from?: { id?: number } }> = (eventData, roomContext) => {
  if (roomContext.entityType !== 'user' || roomContext.entityId === null) {
    return false;
  }
  return eventData.from?.id === roomContext.entityId;
};

/**
 * ForTerminalPayment guard checks whether the event is about the terminal
 * payment the room is scoped to. Terminal payments are addressed individually
 * rather than by point of sale: once one is cancelled it no longer references a
 * transaction, so there is no point of sale left to route it by.
 */
export const ForTerminalPaymentGuard: EventGuard<{ id?: number }> = (eventData, roomContext) => {
  if (roomContext.entityType !== 'terminal_payment' || roomContext.entityId === null) {
    return false;
  }
  return eventData.id === roomContext.entityId;
};
