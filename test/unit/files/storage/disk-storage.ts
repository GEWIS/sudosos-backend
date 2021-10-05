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
import sinon from 'sinon';
import { expect } from 'chai';
import * as fs from 'fs';
import path from 'path';
import { DiskStorage } from '../../../../src/files/storage';

describe('Disk Storage', async () => {
  const stubs: sinon.SinonStub[] = [];

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
  });

  describe('saveFile', async () => {
    beforeEach(() => {
      const randomFileNameStub = sinon.stub(DiskStorage, <any>'getRandomName').returns('randomName');
      stubs.push(randomFileNameStub);
    });

    it('should correctly save the file with given filename', async () => {
      const writeFileStub = sinon.stub(fs, 'writeFile').rejects();
      stubs.push(writeFileStub);

      const diskStorage = new DiskStorage('./imaginary/directory');
      const fileName = 'test.txt';
      const fileData = Buffer.from('text content');

      const location = await diskStorage.saveFile(fileName, fileData);
      expect(location).to.equal(path.join(__dirname, '/../../../../imaginary/directory/randomName.txt'));
    });

    // TODO: Write test case for when saving to disk fails
  });
});
