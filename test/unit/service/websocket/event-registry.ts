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
import { EventRegistry, ResolvedRoom } from '../../../../src/service/websocket/event-registry';

describe('EventRegistry', () => {
  let registry: EventRegistry;

  beforeEach(() => {
    registry = new EventRegistry();
  });

  describe('register', () => {
    it('should register an event handler', () => {
      const resolver = (): ResolvedRoom[] => [];
      const guard = async () => true;

      registry.register('test:event', { resolver, guard });

      const handler = registry.getHandler('test:event');
      expect(handler).to.not.be.undefined;
      expect(handler?.resolver).to.equal(resolver);
      expect(handler?.guard).to.equal(guard);
    });

    it('should overwrite existing handler when registering same event type', () => {
      const resolver1 = (): ResolvedRoom[] => [];
      const guard1 = async () => true;
      const resolver2 = (): ResolvedRoom[] => [{ roomName: 'test', entityId: null as number | null }];
      const guard2 = async () => false;

      registry.register('test:event', { resolver: resolver1, guard: guard1 });
      registry.register('test:event', { resolver: resolver2, guard: guard2 });

      const handler = registry.getHandler('test:event');
      expect(handler?.resolver).to.equal(resolver2);
      expect(handler?.guard).to.equal(guard2);
    });

    it('should register multiple different event types', () => {
      const resolver1 = (): ResolvedRoom[] => [];
      const guard1 = async () => true;
      const resolver2 = (): ResolvedRoom[] => [];
      const guard2 = async () => false;

      registry.register('event:one', { resolver: resolver1, guard: guard1 });
      registry.register('event:two', { resolver: resolver2, guard: guard2 });

      expect(registry.getHandler('event:one')?.guard).to.equal(guard1);
      expect(registry.getHandler('event:two')?.guard).to.equal(guard2);
    });
  });

  describe('getHandler', () => {
    it('should return undefined for unregistered event type', () => {
      const handler = registry.getHandler('unregistered:event');
      expect(handler).to.be.undefined;
    });

    it('should return registered handler', () => {
      const resolver = (): ResolvedRoom[] => [{ roomName: 'test', entityId: 123 }];
      const guard = async () => true;

      registry.register('test:event', { resolver, guard });

      const handler = registry.getHandler('test:event');
      expect(handler).to.not.be.undefined;
      expect(handler?.resolver).to.equal(resolver);
      expect(handler?.guard).to.equal(guard);
    });

    it('should return correct handler for specific event type', () => {
      const resolver1 = (): ResolvedRoom[] => [];
      const guard1 = async () => true;
      const resolver2 = (): ResolvedRoom[] => [];
      const guard2 = async () => false;

      registry.register('event:one', { resolver: resolver1, guard: guard1 });
      registry.register('event:two', { resolver: resolver2, guard: guard2 });

      const handler1 = registry.getHandler('event:one');
      const handler2 = registry.getHandler('event:two');

      expect(handler1?.guard).to.equal(guard1);
      expect(handler2?.guard).to.equal(guard2);
    });
  });
});
