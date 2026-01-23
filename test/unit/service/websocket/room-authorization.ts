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
import { parseRoom, matchesRoomPattern } from '../../../../src/service/websocket/room-authorization';

describe('Room Authorization', () => {
  describe('parseRoom', () => {
    it('should parse specific room pattern with entity ID', () => {
      const result = parseRoom('pos:123:transactions');
      
      expect(result).to.not.be.null;
      expect(result?.entityType).to.equal('pos');
      expect(result?.entityId).to.equal(123);
      expect(result?.eventType).to.equal('transactions');
      expect(result?.isGlobal).to.be.false;
    });

    it('should parse global room pattern', () => {
      const result = parseRoom('transactions:all');
      
      expect(result).to.not.be.null;
      expect(result?.entityType).to.equal('transactions');
      expect(result?.entityId).to.be.null;
      expect(result?.eventType).to.equal('all');
      expect(result?.isGlobal).to.be.true;
    });

    it('should parse pattern with {id} placeholder', () => {
      const result = parseRoom('pos:{id}:transactions');
      
      expect(result).to.not.be.null;
      expect(result?.entityType).to.equal('pos');
      expect(result?.entityId).to.be.null;
      expect(result?.eventType).to.equal('transactions');
      expect(result?.isGlobal).to.be.false;
    });

    it('should return null for invalid pattern', () => {
      expect(parseRoom('invalid')).to.be.null;
      expect(parseRoom('pos:abc:transactions')).to.be.null;
      expect(parseRoom('pos:123')).to.be.null;
      expect(parseRoom('')).to.be.null;
    });

    it('should handle different entity types', () => {
      const posResult = parseRoom('pos:123:transactions');
      const userResult = parseRoom('user:456:transactions');
      const customResult = parseRoom('custom_entity:789:events');

      expect(posResult?.entityType).to.equal('pos');
      expect(userResult?.entityType).to.equal('user');
      expect(customResult?.entityType).to.equal('custom_entity');
    });

    it('should handle different event types', () => {
      const transactionsResult = parseRoom('pos:123:transactions');
      const updatesResult = parseRoom('pos:123:updates');
      const customResult = parseRoom('pos:123:custom_event');

      expect(transactionsResult?.eventType).to.equal('transactions');
      expect(updatesResult?.eventType).to.equal('updates');
      expect(customResult?.eventType).to.equal('custom_event');
    });

    it('should parse large entity IDs', () => {
      const result = parseRoom('pos:999999:transactions');
      
      expect(result?.entityId).to.equal(999999);
    });

    it('should handle entity types with underscores', () => {
      const result = parseRoom('point_of_sale:123:transactions');
      
      expect(result?.entityType).to.equal('point_of_sale');
    });
  });

  describe('matchesRoomPattern', () => {
    it('should match exact room name', () => {
      expect(matchesRoomPattern('pos:123:transactions', 'pos:123:transactions')).to.be.true;
    });

    it('should match pattern with {id} placeholder', () => {
      expect(matchesRoomPattern('pos:{id}:transactions', 'pos:123:transactions')).to.be.true;
      expect(matchesRoomPattern('pos:{id}:transactions', 'pos:456:transactions')).to.be.true;
    });

    it('should not match different entity types', () => {
      expect(matchesRoomPattern('pos:{id}:transactions', 'user:123:transactions')).to.be.false;
    });

    it('should not match different event types', () => {
      expect(matchesRoomPattern('pos:{id}:transactions', 'pos:123:updates')).to.be.false;
    });

    it('should not match when pattern does not match', () => {
      expect(matchesRoomPattern('pos:{id}:transactions', 'pos:123:transactions:extra')).to.be.false;
      expect(matchesRoomPattern('pos:{id}:transactions', 'invalid:123:transactions')).to.be.false;
    });

    it('should handle multiple {id} placeholders', () => {
      expect(matchesRoomPattern('pos:{id}:user:{id}:transactions', 'pos:123:user:456:transactions')).to.be.true;
    });

    it('should match global room patterns', () => {
      expect(matchesRoomPattern('transactions:all', 'transactions:all')).to.be.true;
    });

    it('should not match global pattern to specific room', () => {
      expect(matchesRoomPattern('transactions:all', 'pos:123:transactions')).to.be.false;
    });

    it('should handle special characters in entity and event types', () => {
      expect(matchesRoomPattern('test_entity:{id}:test_event', 'test_entity:123:test_event')).to.be.true;
    });
  });
});
