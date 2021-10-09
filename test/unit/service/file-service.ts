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
import { Connection } from 'typeorm';
import { expect, assert } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import bodyParser from 'body-parser';
import { UploadedFile } from 'express-fileupload';
import sinon from 'sinon';
import path from 'path';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import BaseFile from '../../../src/entity/file/base-file';
import User from '../../../src/entity/user/user';
import { seedUsers } from '../../seed';
import SimpleFileRequest from '../../../src/controller/request/simple-file-request';
import FileService from '../../../src/service/file-service';
import { DiskStorage } from '../../../src/files/storage';

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
describe('FileService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    files: BaseFile[],
  };

  const uploadedFile: UploadedFile = {
    name: 'file.txt',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-shadow
    mv: (path: string) => (Promise.resolve()),
    encoding: '',
    mimetype: 'text/plain',
    data: Buffer.from('information'),
    tempFilePath: '',
    truncated: false,
    size: 69,
    md5: '',
  };

  const stubs: sinon.SinonStub[] = [];

  before(async () => {
    const connection = await Database.initialize();

    const users = await seedUsers();

    const files = [
      Object.assign(new BaseFile(), {
        location: 'location0',
        downloadName: 'testfile0.txt',
        createdBy: users[0],
      }),
      Object.assign(new BaseFile(), {
        location: 'location1',
        downloadName: 'testfile1.txt',
        createdBy: users[0],
      }),
      Object.assign(new BaseFile(), {
        location: 'location2',
        downloadName: 'testfile2.txt',
        createdBy: users[0],
      }),
      Object.assign(new BaseFile(), {
        location: 'location3',
        downloadName: 'testfile3.txt',
        createdBy: users[0],
      }),
    ] as BaseFile[];

    await BaseFile.save(files);

    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    ctx = {
      connection,
      app,
      specification,
      users,
      files,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('uploadSimpleFile', () => {
    it('should return baseFile object with custom name when uploading a file', async () => {
      const simpleFileParams: SimpleFileRequest = {
        name: 'veryCoolName',
      };

      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').resolves('fileLocation');
      stubs.push(saveFileStub);

      const res: BaseFile = await FileService
        .uploadSimpleFile('simple', ctx.users[0], uploadedFile, simpleFileParams);

      expect(res).to.exist;
      expect(saveFileStub).to.have.been.calledWith(
        uploadedFile.name,
        uploadedFile.data,
      );
      expect(res.downloadName).to.equal(`${simpleFileParams.name}${path.extname(uploadedFile.name)}`);
      expect(res.location).to.equal('fileLocation');
    });

    it('should not save a baseFile object when saving to storage fails', async () => {
      const filesBefore = await BaseFile.count();

      const simpleFileParams: SimpleFileRequest = {
        name: 'veryCoolName',
      };

      const error = new Error('Cannot save file to disk');
      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').throwsException(error);
      stubs.push(saveFileStub);

      try {
        await FileService.uploadSimpleFile('simple', ctx.users[0], uploadedFile, simpleFileParams);
        assert(false, 'Expected FileService.uploadSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(`Error: ${error.message}`);
      }

      expect(await BaseFile.count()).to.equal(filesBefore);
    });

    it('should not store the file on disk when saving fails', async () => {
      const filesBefore = await BaseFile.count();

      const simpleFileParams: SimpleFileRequest = {
        name: 'veryCoolName',
      };

      const error = new Error('Could not save baseFile object');
      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').resolves('fileLocation');
      stubs.push(saveFileStub);
      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').resolves(true);
      stubs.push(deleteFileStub);
      const saveFileObjStub = sinon.stub(BaseFile.prototype, 'save')
        .onFirstCall()
        .onSecondCall().throwsException(error);
      stubs.push(saveFileObjStub);
      // Because BaseFile.save() is overwritten, the file is not saved to the database.
      const deleteBaseFileStub = sinon.stub(BaseFile, 'delete').resolves();
      stubs.push(deleteBaseFileStub);

      try {
        await FileService.uploadSimpleFile('simple', ctx.users[0], uploadedFile, simpleFileParams);
        assert(false, 'Expected FileService.uploadSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(`Error: ${error.message}`);
      }

      expect(await BaseFile.count()).to.equal(filesBefore);
      expect(deleteFileStub).to.have.been.called;
      expect(deleteBaseFileStub).to.have.been.called;
    });

    it('should throw an error when invalid file entity is provided', async () => {
      const entity = 'unknown entity that does not exist';
      try {
        // @ts-ignore
        await FileService.uploadSimpleFile(entity, ctx.users[0], uploadedFile, {});
        assert(false, 'Expected FileService.uploadSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(`Unknown entity file type: ${entity}`);
      }
    });

    it('should throw an error when invalid storage method is provided in environment variables', async () => {
      const storageMethod = process.env.FILE_STORAGE_METHOD;
      process.env.FILE_STORAGE_METHOD = 'Nonexisting';

      try {
        await FileService.uploadSimpleFile('simple', ctx.users[0], uploadedFile, {
          name: 'not boeiend',
        });
        assert(false, 'Expected FileService.uploadSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(`Unknown file storage method: ${process.env.FILE_STORAGE_METHOD}`);
      }

      process.env.FILE_STORAGE_METHOD = storageMethod;
    });
  });

  describe('getSimpleFile', async () => {
    it('should return the appropriate file', async () => {
      const buffer = Buffer.from('little string');
      const getFileStub = sinon.stub(DiskStorage.prototype, 'getFile').resolves(buffer);
      stubs.push(getFileStub);

      const { file, data } = await FileService.getSimpleFile('simple', ctx.files[0].id);
      expect(data).to.equal(buffer);
      expect(file.downloadName).to.equal(ctx.files[0].downloadName);
      expect(file.location).to.equal(ctx.files[0].location);
    });
    it('should return undefined when file does not exist', async () => {
      const result = await FileService.getSimpleFile('simple', ctx.files[ctx.files.length - 1].id + 39);
      expect(result).to.be.undefined;
    });
    it('should throw error when getting file from storage fails', async () => {
      const error = new Error('Could not get file from storage');
      const getFileStub = sinon.stub(DiskStorage.prototype, 'getFile').rejects(error);
      stubs.push(getFileStub);

      try {
        await FileService.getSimpleFile('simple', ctx.files[0].id);
        assert(false, 'Expected FileService.getSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(error.message);
      }
    });
  });

  describe('deleteSimpleFile', async () => {
    it('should delete appropriate file from database', async () => {
      const lengthBefore = await BaseFile.count();
      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').resolves(true);
      stubs.push(deleteFileStub);

      await FileService.deleteSimpleFile('simple', ctx.files[0].id);
      expect(await BaseFile.count()).to.equal(lengthBefore - 1);

      const result = await FileService.getSimpleFile('simple', ctx.files[0].id);
      expect(result).to.be.undefined;
    });
    it('should delete file from database when file no longer in storage', async () => {
      const lengthBefore = await BaseFile.count();
      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').resolves(false);
      stubs.push(deleteFileStub);

      await FileService.deleteSimpleFile('simple', ctx.files[1].id);
      expect(await BaseFile.count()).to.equal(lengthBefore - 1);

      const result = await FileService.getSimpleFile('simple', ctx.files[1].id);
      expect(result).to.be.undefined;
    });
    it('should throw error when deleting file from storage fails', async () => {
      const buffer = Buffer.from('little string');
      const error = new Error('Deletion failed');

      const lengthBefore = await BaseFile.count();
      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').rejects(error);
      stubs.push(deleteFileStub);
      const getFileStub = sinon.stub(DiskStorage.prototype, 'getFile').resolves(buffer);
      stubs.push(getFileStub);

      try {
        await FileService.deleteSimpleFile('simple', ctx.files[2].id);
        assert(false, 'Expected FileService.deleteSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(error.message);
      }
      expect(await BaseFile.count()).to.equal(lengthBefore);

      const result = await FileService.getSimpleFile('simple', ctx.files[2].id);
      expect(result).to.not.be.undefined;
    });
    it('should return when file does not exist', async () => {
      const lengthBefore = await BaseFile.count();

      await FileService.deleteSimpleFile('simple', ctx.files[ctx.files.length - 1].id + 39);
      expect(await BaseFile.count()).to.equal(lengthBefore);
    });
    it('should throw error when deleting from database fails', async () => {
      const error = new Error('Deleting file from database failed');
      const buffer = Buffer.from('little string');

      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').resolves(false);
      stubs.push(deleteFileStub);
      const deleteFileObjStub = sinon.stub(BaseFile, 'delete').rejects(error);
      stubs.push(deleteFileObjStub);
      const getFileStub = sinon.stub(DiskStorage.prototype, 'getFile').resolves(buffer);
      stubs.push(getFileStub);

      try {
        await FileService.deleteSimpleFile('simple', ctx.files[2].id);
        assert(false, 'Expected FileService.deleteSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(error.message);
      }

      const result = await FileService.getSimpleFile('simple', ctx.files[2].id);
      expect(result).to.not.be.undefined;
    });
  });
});
