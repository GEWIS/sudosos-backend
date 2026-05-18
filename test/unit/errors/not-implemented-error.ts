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
import { NotImplementedError } from '../../../src/errors/not-implemented-error';

describe('NotImplementedError', () => {
  it('should be an instance of Error', () => {
    const err = new NotImplementedError();
    expect(err).to.be.instanceOf(Error);
    expect(err).to.be.instanceOf(NotImplementedError);
  });

  it('should set its name to "NotImplementedError"', () => {
    const err = new NotImplementedError();
    expect(err.name).to.equal('NotImplementedError');
  });

  it('should retain the provided message', () => {
    const err = new NotImplementedError('not done yet');
    expect(err.message).to.equal('not done yet');
  });

  it('should default to an empty message when none is given', () => {
    const err = new NotImplementedError();
    expect(err.message).to.equal('');
  });

  it('should produce a stack trace that includes the error name and message', () => {
    const err = new NotImplementedError('boom');
    expect(err.stack).to.be.a('string');
    expect(err.stack).to.include('NotImplementedError');
    expect(err.stack).to.include('boom');
  });

  it('should be throwable and catchable', () => {
    const thrower = () => { throw new NotImplementedError('todo'); };
    expect(thrower).to.throw(NotImplementedError, 'todo');
  });
});
