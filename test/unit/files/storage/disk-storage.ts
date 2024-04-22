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
import { expect, assert } from 'chai';
import path from 'path';
import { Connection } from 'typeorm';
import { DiskStorage } from '../../../../src/files/storage';
import BaseFile from '../../../../src/entity/file/base-file';
import User from '../../../../src/entity/user/user';
import { seedUsers } from '../../../seed';
import Database from '../../../../src/database/database';
import { truncateAllTables } from '../../../setup';

const workdir = './imaginary/directory';

describe('Disk Storage', async () => {
  let ctx: {
    connection: Connection,
    files: BaseFile[],
    users: User[],
    diskStorage: DiskStorage,
  };

  const stubs: sinon.SinonStub[] = [];

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);

    const users = await seedUsers();

    const files: BaseFile[] = [
      Object.assign(new BaseFile(), {
        location: path.join(__dirname, '/../../../..', workdir, 'file0.txt'),
        downloadName: 'testfile0.txt',
        createdBy: users[0],
      }),
      Object.assign(new BaseFile(), {
        location: path.join(__dirname, '/../../../..', workdir, 'file1.txt'),
        downloadName: 'testfile0.txt',
        createdBy: users[0],
      }),
      Object.assign(new BaseFile(), {
        location: path.join(__dirname, '/../../../..', workdir, 'file2.txt'),
        downloadName: 'testfile0.txt',
        createdBy: users[0],
      }),
    ];

    await BaseFile.save(files);

    const diskStorage = new DiskStorage('./imaginary/directory');

    ctx = {
      connection,
      users,
      files,
      diskStorage,
    };
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  after(async () => {
    await Database.finish(ctx.connection);
  });

  describe('saveFile', async () => {
    beforeEach(() => {
      const randomFileNameStub = sinon.stub(DiskStorage, <any>'getRandomName').returns('randomName');
      stubs.push(randomFileNameStub);
    });

    it('should correctly save the file with given filename', async () => {
      const fileName = 'test.txt';
      const fileData = Buffer.from('text content');
      const expLocation = path.join(__dirname, '/../../../../imaginary/directory/randomName.txt');

      const writeFileStub = sinon.stub(DiskStorage, <any>'writeFile').returns(expLocation);
      stubs.push(writeFileStub);

      const result = await ctx.diskStorage.saveFile(fileName, fileData);
      expect(result).to.equal(expLocation);
    });
    it('should reject when saving to disk fails', async () => {
      const fileName = 'test.txt';
      const fileData = Buffer.from('text content');

      const writeFileStub = sinon.stub(DiskStorage, <any>'writeFile').throwsException(new Error('Saving failed'));
      stubs.push(writeFileStub);

      await expect(ctx.diskStorage.saveFile(fileName, fileData))
        .to.eventually.be.rejected;
    });
  });

  describe('getFile', async () => {
    it('should correctly return buffer for the given file', async () => {
      const buffer = Buffer.from('Wie dit leest trekt een rbac');
      const fileExistsStub = sinon.stub(DiskStorage, <any>'fileExists').returns(true);
      stubs.push(fileExistsStub);
      const readFileStub = sinon.stub(DiskStorage, <any>'readFile').returns(buffer);
      stubs.push(readFileStub);

      const data = await ctx.diskStorage.getFile(ctx.files[0]);
      expect(data).to.equal(buffer);
    });
    it('should reject when file does not exist', async () => {
      const fileExistsStub = sinon.stub(DiskStorage, <any>'fileExists').returns(false);
      stubs.push(fileExistsStub);

      try {
        await ctx.diskStorage.getFile(ctx.files[0]);
        assert(false, 'diskStorage.getFile did not throw an error');
      } catch (e) {
        expect(e.message).to.equal(`Given file does not exist on disk: ${ctx.files[0].location}`);
      }
    });
    it('should reject when reading file fails', async () => {
      const error = new Error('Getting file failed');
      const fileExistsStub = sinon.stub(DiskStorage, <any>'fileExists').returns(true);
      stubs.push(fileExistsStub);
      const readFileStub = sinon.stub(DiskStorage, <any>'readFile').throws(error);
      stubs.push(readFileStub);

      try {
        await ctx.diskStorage.getFile(ctx.files[0]);
        assert(false, 'diskStorage.getFile did not throw an error');
      } catch (e) {
        expect(e.message).to.equal(error.message);
      }
    });
  });

  describe('deleteFile', async () => {
    it('should correctly delete file on disk given baseFile object', async () => {
      const fileExistsStub = sinon.stub(DiskStorage, <any>'fileExists').returns(true);
      stubs.push(fileExistsStub);
      const removeFileStub = sinon.stub(DiskStorage, <any>'removeFile');
      stubs.push(removeFileStub);

      await ctx.diskStorage.deleteFile(ctx.files[0]);
      expect(removeFileStub).to.be.calledWith(ctx.files[0].location);
    });
    it('should reject when file does not exist', async () => {
      const fileExistsStub = sinon.stub(DiskStorage, <any>'fileExists').returns(false);
      stubs.push(fileExistsStub);

      try {
        await ctx.diskStorage.getFile(ctx.files[0]);
        assert(false, 'diskStorage.deleteFile did not throw an error');
      } catch (e) {
        expect(e.message).to.equal(`Given file does not exist on disk: ${ctx.files[0].location}`);
      }
    });
    it('should reject when deleting file fails', async () => {
      const error = new Error('Removing file from disk failed');
      const fileExistsStub = sinon.stub(DiskStorage, <any>'fileExists').returns(true);
      stubs.push(fileExistsStub);
      const removeFileStub = sinon.stub(DiskStorage, <any>'removeFile').throws(error);
      stubs.push(removeFileStub);

      try {
        await ctx.diskStorage.deleteFile(ctx.files[0]);
        assert(false, 'diskStorage.deleteFile did not throw an error');
      } catch (e) {
        expect(e.message).to.equal(error.message);
      }
    });
  });
});
