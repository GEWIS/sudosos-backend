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
import splitTypes, { getIdsAndRequests } from '../../../src/helpers/array-splitter';

describe('array-splitter', () => {
  describe('splitTypes', () => {
    it('should partition items matching the split typeof string into "type"', () => {
      const { type, remainder } = splitTypes<number, string>([1, 'a', 2, 'b'], 'number');
      expect(type).to.deep.equal([1, 2]);
      expect(remainder).to.deep.equal(['a', 'b']);
    });

    it('should return empty type array when no items match', () => {
      const { type, remainder } = splitTypes<number, string>(['a', 'b'], 'number');
      expect(type).to.deep.equal([]);
      expect(remainder).to.deep.equal(['a', 'b']);
    });

    it('should return empty remainder array when all items match', () => {
      const { type, remainder } = splitTypes<number, string>([1, 2, 3], 'number');
      expect(type).to.deep.equal([1, 2, 3]);
      expect(remainder).to.deep.equal([]);
    });

    it('should handle empty input', () => {
      const { type, remainder } = splitTypes<number, string>([], 'number');
      expect(type).to.deep.equal([]);
      expect(remainder).to.deep.equal([]);
    });
  });

  describe('getIdsAndRequests', () => {
    it('should split numbers into ids and objects into requests', () => {
      const { ids, requests } = getIdsAndRequests<{ name: string }>([
        1,
        { name: 'first' },
        2,
        { name: 'second' },
      ]);
      expect(ids).to.deep.equal([1, 2]);
      expect(requests).to.deep.equal([{ name: 'first' }, { name: 'second' }]);
    });

    it('should pull the id off objects that also carry one and add it to ids', () => {
      const { ids, requests } = getIdsAndRequests<{ id: number; name: string }>([
        1,
        { id: 5, name: 'x' },
        { id: 7, name: 'y' },
      ]);
      expect(ids).to.have.members([1, 5, 7]);
      expect(requests).to.deep.equal([
        { id: 5, name: 'x' },
        { id: 7, name: 'y' },
      ]);
    });

    it('should return empty arrays for an empty input', () => {
      const { ids, requests } = getIdsAndRequests([]);
      expect(ids).to.deep.equal([]);
      expect(requests).to.deep.equal([]);
    });

    it('should keep objects without an id in requests only', () => {
      const { ids, requests } = getIdsAndRequests<{ name: string }>([
        1,
        { name: 'no-id' },
      ]);
      expect(ids).to.deep.equal([1]);
      expect(requests).to.deep.equal([{ name: 'no-id' }]);
    });
  });
});
