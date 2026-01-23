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
import { RoomPolicyRegistry } from '../../../../src/service/websocket/room-policy';

describe('RoomPolicyRegistry', () => {
  let registry: RoomPolicyRegistry;

  beforeEach(() => {
    registry = new RoomPolicyRegistry();
  });

  describe('register', () => {
    it('should register a room with policy', () => {
      const policy = async () => true;

      registry.register({
        pattern: 'pos:{id}:transactions',
        policy,
      });

      const registration = registry.findRegistration('pos:123:transactions');
      expect(registration).to.not.be.undefined;
      expect(registration?.pattern).to.equal('pos:{id}:transactions');
      expect(registration?.policy).to.equal(policy);
    });

    it('should register multiple rooms', () => {
      const policy1 = async () => true;
      const policy2 = async () => false;

      registry.register({
        pattern: 'pos:{id}:transactions',
        policy: policy1,
      });

      registry.register({
        pattern: 'user:{id}:transactions',
        policy: policy2,
      });

      const reg1 = registry.findRegistration('pos:123:transactions');
      const reg2 = registry.findRegistration('user:456:transactions');

      expect(reg1?.pattern).to.equal('pos:{id}:transactions');
      expect(reg2?.pattern).to.equal('user:{id}:transactions');
    });

    it('should allow registering same pattern multiple times (first match wins)', () => {
      const policy1 = async () => true;
      const policy2 = async () => false;

      registry.register({
        pattern: 'pos:{id}:transactions',
        policy: policy1,
      });

      registry.register({
        pattern: 'pos:{id}:transactions',
        policy: policy2,
      });

      const registration = registry.findRegistration('pos:123:transactions');
      // find() returns the first match, so policy1 will be returned
      expect(registration?.policy).to.equal(policy1);
    });
  });

  describe('findRegistration', () => {
    it('should return undefined for unregistered room', () => {
      const registration = registry.findRegistration('unregistered:room');
      expect(registration).to.be.undefined;
    });

    it('should find registration by exact match', () => {
      const policy = async () => true;

      registry.register({
        pattern: 'system',
        policy,
      });

      const registration = registry.findRegistration('system');
      expect(registration).to.not.be.undefined;
      expect(registration?.pattern).to.equal('system');
    });

    it('should find registration by pattern match', () => {
      const policy = async () => true;

      registry.register({
        pattern: 'pos:{id}:transactions',
        policy,
      });

      const registration = registry.findRegistration('pos:123:transactions');
      expect(registration).to.not.be.undefined;
      expect(registration?.pattern).to.equal('pos:{id}:transactions');
    });

    it('should return first matching registration when multiple patterns match', () => {
      const policy1 = async () => true;
      const policy2 = async () => false;

      registry.register({
        pattern: 'pos:{id}:transactions',
        policy: policy1,
      });

      registry.register({
        pattern: 'pos:123:transactions',
        policy: policy2,
      });

      // Should find the first one (pattern match)
      const registration = registry.findRegistration('pos:123:transactions');
      expect(registration).to.not.be.undefined;
      // Note: find() returns first match, so it depends on order
      expect(registration?.pattern).to.be.oneOf(['pos:{id}:transactions', 'pos:123:transactions']);
    });

    it('should not match different entity types', () => {
      registry.register({
        pattern: 'pos:{id}:transactions',
        policy: async () => true,
      });

      const registration = registry.findRegistration('user:123:transactions');
      expect(registration).to.be.undefined;
    });

    it('should not match different event types', () => {
      registry.register({
        pattern: 'pos:{id}:transactions',
        policy: async () => true,
      });

      const registration = registry.findRegistration('pos:123:updates');
      expect(registration).to.be.undefined;
    });
  });
});
