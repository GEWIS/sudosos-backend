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
import { expect } from 'chai';
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

    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    ctx = {
      connection,
      app,
      specification,
      users,
    };
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('saveSimpleFile', () => {
    it('should return baseFile object with custom name when uploading a file', async () => {
      const simpleFileParams: SimpleFileRequest = {
        name: 'veryCoolName',
      };

      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').returns(Promise.resolve('fileLocation'));
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

    it('should not save a baseFile object when saving fails', async () => {
      const filesBefore = await BaseFile.count();

      const simpleFileParams: SimpleFileRequest = {
        name: 'veryCoolName',
      };

      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').throwsException('Cannot save file to disk');
      stubs.push(saveFileStub);

      expect(FileService.uploadSimpleFile('simple', ctx.users[0], uploadedFile, simpleFileParams))
        .to.eventually.be.rejected
        .and.be.an.instanceOf(Error);
      expect(await BaseFile.count()).to.equal(filesBefore);
    });

    it('should not store the file on disk when saving fails', async () => {
      const filesBefore = await BaseFile.count();

      const simpleFileParams: SimpleFileRequest = {
        name: 'veryCoolName',
      };

      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').returns(Promise.resolve('fileLocation'));
      stubs.push(saveFileStub);
      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').returns(Promise.resolve(undefined));
      stubs.push(deleteFileStub);
      const saveFileObjStub = sinon.stub(BaseFile.prototype, 'save').onCall(1).throwsException(Error('Could not save baseFile object'));
      stubs.push(saveFileObjStub);

      expect(FileService.uploadSimpleFile('simple', ctx.users[0], uploadedFile, simpleFileParams))
        .to.eventually.be.rejected
        .and.be.an.instanceOf(Error);
      expect(await BaseFile.count()).to.equal(filesBefore);
      expect(deleteFileStub).to.have.been.called;
    });
  });
});
