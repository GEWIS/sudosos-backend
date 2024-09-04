/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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

import { asArrayOfUserTypes, asUserType } from '../../../src/helpers/validators';
import { expect } from 'chai';
import { UserType } from '../../../src/entity/user/user';

xdescribe('Validators', (): void => {
  describe('asUserType', (): void => {
    it('should accept string inputs', async () => {
      const valid = asUserType('MEMBER');
      expect(valid).to.not.be.undefined;
      expect(valid).to.equal(UserType.MEMBER);
    });
    it('should throw erorr if number', () => {
      expect(() => asUserType(1)).to.throw();
    });
    it('should throw error for bad input', async () => {
      expect(() => asUserType('TEST')).to.throw();
      expect(() => asUserType(-1)).to.throw();
    });
  });
  describe('asArrayOfUserTypes', (): void => {
    it('should accept string input', () => {
      const valid = asArrayOfUserTypes('MEMBER');
      expect(valid).to.not.be.undefined;
      expect(valid).to.deep.equalInAnyOrder([UserType.MEMBER]);
    });
    it('should accept string inputs', () => {
      const valid = asArrayOfUserTypes(['MEMBER', 'LOCAL_ADMIN']);
      expect(valid).to.not.be.undefined;
      expect(valid).to.deep.equalInAnyOrder([UserType.MEMBER, UserType.LOCAL_ADMIN]);
    });
    it('should throw if number input', () => {
      expect(() => asArrayOfUserTypes(1)).to.throw();
    });
    it('should throw if multiple number inputs', () => {
      expect(() => asArrayOfUserTypes([1, 2])).to.throw();
    });
    it('should throw if combination of string and number inputs', () => {
      expect(() => asArrayOfUserTypes([1, UserType.MEMBER])).to.throw();
    });
    it('should throw if invalid userType', () => {
      expect(() => asArrayOfUserTypes('TEST')).to.throw();
    });
    it('should throw if one invalid userType', () => {
      expect(() => asArrayOfUserTypes([UserType.MEMBER, 'TEST'])).to.throw();
    });
  });
});
