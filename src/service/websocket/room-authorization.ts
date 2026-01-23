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

/**
 * Represents a parsed room name with its components.
 */
export interface ParsedRoom {
  entityType: string;
  entityId: number | null;
  eventType: string;
  isGlobal: boolean;
}

/**
 * Parses a room name into its components.
 * Supports patterns:
 * - {entity_type}:{entity_id}:{event_type} (e.g., "pos:123:transactions")
 * - {entity_type}:{event_type} (e.g., "transactions:all") for global listeners
 * - Pattern with {id} placeholder (e.g., "pos:{id}:transactions") for matching
 * 
 * @param room - The room name to parse, or a pattern with {id} placeholder.
 * @returns Parsed room information or null if invalid format.
 */
export function parseRoom(room: string): ParsedRoom | null {
  // Pattern: entity_type:entity_id:event_type
  const specificMatch = room.match(/^([a-z_]+):(\d+):([a-z_]+)$/);
  if (specificMatch) {
    return {
      entityType: specificMatch[1],
      entityId: parseInt(specificMatch[2], 10),
      eventType: specificMatch[3],
      isGlobal: false,
    };
  }

  // Pattern: entity_type:event_type (global listener)
  const globalMatch = room.match(/^([a-z_]+):([a-z_]+)$/);
  if (globalMatch) {
    return {
      entityType: globalMatch[1],
      entityId: null,
      eventType: globalMatch[2],
      isGlobal: true,
    };
  }

  // Pattern with {id} placeholder: entity_type:{id}:event_type
  const patternMatch = room.match(/^([a-z_]+):\{id\}:([a-z_]+)$/);
  if (patternMatch) {
    return {
      entityType: patternMatch[1],
      entityId: null, // Placeholder, will be resolved later
      eventType: patternMatch[2],
      isGlobal: false,
    };
  }

  return null;
}

/**
 * Checks if a room name matches a pattern.
 * Supports exact matches and patterns with {id} placeholder.
 * @param pattern - The pattern (may contain {id} placeholder).
 * @param room - The room name to match.
 * @returns True if the room matches the pattern.
 */
export function matchesRoomPattern(pattern: string, room: string): boolean {
  // Exact match
  if (pattern === room) {
    return true;
  }

  // Pattern match with {id} placeholder
  const regexPattern = pattern.replace(/\{id\}/g, '(\\d+)');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(room);
}
