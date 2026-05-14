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
import sinon from 'sinon';
import { Response } from 'express';
import putFileInResponse from '../../../src/files/response';
import BaseFile from '../../../src/entity/file/base-file';

describe('putFileInResponse', () => {
  let res: {
    setHeader: sinon.SinonStub;
    status: sinon.SinonStub;
    send: sinon.SinonStub;
  };

  beforeEach(() => {
    res = {
      setHeader: sinon.stub(),
      status: sinon.stub(),
      send: sinon.stub(),
    };
  });

  it('should set Content-Type, Content-Length, Content-Disposition and status, then send the data', () => {
    const data = Buffer.from('hello world', 'utf-8');
    const file = {
      location: 'invoices/receipt.pdf',
      downloadName: 'receipt.pdf',
    } as BaseFile;

    putFileInResponse(res as unknown as Response, file, data);

    expect(res.setHeader.calledWith('Content-Type', 'application/pdf')).to.be.true;
    expect(res.setHeader.calledWith('Content-Length', String(data.byteLength))).to.be.true;
    expect(res.setHeader.calledWith('Content-Disposition', 'attachment; filename="receipt.pdf"')).to.be.true;
    expect(res.status.calledOnceWith(200)).to.be.true;
    expect(res.send.calledOnceWith(data)).to.be.true;
  });

  it('should still send the body when mime.lookup returns false for an unknown extension', () => {
    const data = Buffer.from([0, 1, 2, 3]);
    const file = {
      location: 'unknown/file.bogus-extension-no-mime',
      downloadName: 'file.bogus-extension-no-mime',
    } as BaseFile;

    putFileInResponse(res as unknown as Response, file, data);

    expect(res.setHeader.firstCall.args[0]).to.equal('Content-Type');
    expect(res.setHeader.firstCall.args[1]).to.equal('false');
    expect(res.send.calledOnceWith(data)).to.be.true;
  });
});
