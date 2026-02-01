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
import { InPosGuard, ForUserGuard } from '../../../../src/service/websocket/event-guards';
import { ParsedRoom } from '../../../../src/service/websocket/room-parser';

describe('Event Guards', () => {
  describe('InPosGuard', () => {
    it('should return true when transaction belongs to POS in room', () => {
      const eventData = { pointOfSale: { id: 123 } };
      const roomContext: ParsedRoom = {
        entityType: 'pos',
        entityId: 123,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(InPosGuard(eventData, roomContext)).to.be.true;
    });

    it('should return false when transaction belongs to different POS', () => {
      const eventData = { pointOfSale: { id: 456 } };
      const roomContext: ParsedRoom = {
        entityType: 'pos',
        entityId: 123,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(InPosGuard(eventData, roomContext)).to.be.false;
    });

    it('should return false when room is not POS type', () => {
      const eventData = { pointOfSale: { id: 123 } };
      const roomContext: ParsedRoom = {
        entityType: 'user',
        entityId: 123,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(InPosGuard(eventData, roomContext)).to.be.false;
    });

    it('should return false when room entityId is null', () => {
      const eventData = { pointOfSale: { id: 123 } };
      const roomContext: ParsedRoom = {
        entityType: 'pos',
        entityId: null,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(InPosGuard(eventData, roomContext)).to.be.false;
    });

    it('should return false when transaction has no pointOfSale', () => {
      const eventData = {};
      const roomContext: ParsedRoom = {
        entityType: 'pos',
        entityId: 123,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(InPosGuard(eventData, roomContext)).to.be.false;
    });

    it('should return false when pointOfSale has no id', () => {
      const eventData = { pointOfSale: {} };
      const roomContext: ParsedRoom = {
        entityType: 'pos',
        entityId: 123,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(InPosGuard(eventData, roomContext)).to.be.false;
    });
  });

  describe('ForUserGuard', () => {
    it('should return true when transaction belongs to user in room', () => {
      const eventData = { from: { id: 789 } };
      const roomContext: ParsedRoom = {
        entityType: 'user',
        entityId: 789,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(ForUserGuard(eventData, roomContext)).to.be.true;
    });

    it('should return false when transaction belongs to different user', () => {
      const eventData = { from: { id: 999 } };
      const roomContext: ParsedRoom = {
        entityType: 'user',
        entityId: 789,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(ForUserGuard(eventData, roomContext)).to.be.false;
    });

    it('should return false when room is not user type', () => {
      const eventData = { from: { id: 789 } };
      const roomContext: ParsedRoom = {
        entityType: 'pos',
        entityId: 789,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(ForUserGuard(eventData, roomContext)).to.be.false;
    });

    it('should return false when room entityId is null', () => {
      const eventData = { from: { id: 789 } };
      const roomContext: ParsedRoom = {
        entityType: 'user',
        entityId: null,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(ForUserGuard(eventData, roomContext)).to.be.false;
    });

    it('should return false when transaction has no from user', () => {
      const eventData = {};
      const roomContext: ParsedRoom = {
        entityType: 'user',
        entityId: 789,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(ForUserGuard(eventData, roomContext)).to.be.false;
    });

    it('should return false when from has no id', () => {
      const eventData = { from: {} };
      const roomContext: ParsedRoom = {
        entityType: 'user',
        entityId: 789,
        eventType: 'transactions',
        isGlobal: false,
      };

      expect(ForUserGuard(eventData, roomContext)).to.be.false;
    });
  });
});
