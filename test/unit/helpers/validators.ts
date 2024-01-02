/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */
import {asArrayOfUserTypes, asUserType} from '../../../src/helpers/validators';
import { expect } from 'chai';

describe('Validators', (): void => {
  describe('asUserType', (): void => {
    it('should accept number inputs', () => {
      const valid = asUserType(1);
      expect(valid).to.not.be.undefined;
    });
    it('should accept string inputs', async () => {
      const valid = asUserType('MEMBER');
      expect(valid).to.not.be.undefined;
      expect(valid).to.be.a('number');
    });
    it('should throw error for bad input', async () => {
      expect(() => asUserType('TEST')).to.throw();
      expect(() => asUserType(-1)).to.throw();
    });
  });
  describe('asArrayOfUserTypes', (): void => {
    it('should accept number input', () => {
      const valid = asArrayOfUserTypes(1);
      expect(valid).to.not.be.undefined;
    });
    it('should accept number inputs', () => {
      const valid = asArrayOfUserTypes([1, 2]);
      expect(valid).to.not.be.undefined;
    });
    it('should accept string input', () => {
      const valid = asArrayOfUserTypes('MEMBER');
      expect(valid).to.not.be.undefined;
    });
    it('should accept string inputs', () => {
      const valid = asArrayOfUserTypes(['MEMBER', 'LOCAL_ADMIN']);
      expect(valid).to.not.be.undefined;
    });
    it('should convert string to int', async () => {
      const valid = asArrayOfUserTypes(['MEMBER', 'LOCAL_ADMIN']);
      expect(valid).to.not.be.undefined;
      valid.forEach(item => {
        expect(item).to.be.a('number');
      });
    });
    it('should accept string number input', () => {
      const valid = asArrayOfUserTypes('1');
      expect(valid).to.not.be.undefined;
    });
    it('should accept string number inputs', () => {
      const valid = asArrayOfUserTypes(['1', '2']);
      expect(valid).to.not.be.undefined;
    });
    it('should convert string number to int', async () => {
      const valid = asArrayOfUserTypes(['1', '2']);
      expect(valid).to.not.be.undefined;
      valid.forEach(item => {
        expect(item).to.be.a('number');
      });
    });
  });
});
