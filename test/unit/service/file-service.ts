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
import SimpleFileRequest from '../../../src/controller/request/simple-file-request';
import FileService, { StorageMethod } from '../../../src/service/file-service';
import { DiskStorage } from '../../../src/files/storage';
import Product from '../../../src/entity/product/product';
import ProductImage from '../../../src/entity/file/product-image';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import { ProductSeeder, UserSeeder } from '../../seed';

describe('FileService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    users: User[],
    files: BaseFile[],
    products: Product[],
    productImages: ProductImage[],
    fileService: FileService,
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
    await truncateAllTables(connection);

    const users = await new UserSeeder().seed();
    const { products, productImages } = await new ProductSeeder().seed(users);

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
    const fileService: FileService = new FileService('./data/simple', 'disk');
    const app = express();
    const specification = await Swagger.initialize(app);
    app.use(bodyParser.json());

    ctx = {
      connection,
      app,
      specification,
      users,
      files,
      products,
      productImages,
      fileService,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
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

      const res: BaseFile = await ctx.fileService
        .uploadSimpleFile(ctx.users[0], uploadedFile, simpleFileParams);

      expect(res).to.exist;
      expect(saveFileStub).to.have.been.calledWith(
        `${simpleFileParams.name}.txt`,
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
        await ctx.fileService.uploadSimpleFile(ctx.users[0], uploadedFile, simpleFileParams);
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
        await ctx.fileService.uploadSimpleFile(ctx.users[0], uploadedFile, simpleFileParams);
        assert(false, 'Expected FileService.uploadSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(`Error: ${error.message}`);
      }

      expect(await BaseFile.count()).to.equal(filesBefore);
      expect(deleteFileStub).to.have.been.called;
      expect(deleteBaseFileStub).to.have.been.called;
    });

    it('should throw an error when an FileService is provided with an invalid storage method', async () => {
      const storageMethod = process.env.FILE_STORAGE_METHOD;
      process.env.FILE_STORAGE_METHOD = 'Nonexisting';

      try {
        const tempFileService: FileService = new FileService('/temp', process.env.FILE_STORAGE_METHOD as StorageMethod);
        await tempFileService.uploadSimpleFile(ctx.users[0], uploadedFile, {
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

      const { file, data } = await ctx.fileService.getSimpleFile(ctx.files[0].id);
      expect(data).to.equal(buffer);
      expect(file.downloadName).to.equal(ctx.files[0].downloadName);
      expect(file.location).to.equal(ctx.files[0].location);
    });
    it('should return undefined when file does not exist', async () => {
      const result = await ctx.fileService.getSimpleFile(ctx.files[ctx.files.length - 1].id + 39);
      expect(result).to.be.undefined;
    });
    it('should throw error when getting file from storage fails', async () => {
      const error = new Error('Could not get file from storage');
      const getFileStub = sinon.stub(DiskStorage.prototype, 'getFile').rejects(error);
      stubs.push(getFileStub);

      try {
        await ctx.fileService.getSimpleFile(ctx.files[0].id);
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

      await ctx.fileService.deleteSimpleFile(ctx.files[0].id);
      expect(await BaseFile.count()).to.equal(lengthBefore - 1);

      const result = await ctx.fileService.getSimpleFile(ctx.files[0].id);
      expect(result).to.be.undefined;
    });
    it('should delete file from database when file no longer in storage', async () => {
      const lengthBefore = await BaseFile.count();
      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').resolves(false);
      stubs.push(deleteFileStub);

      await ctx.fileService.deleteSimpleFile(ctx.files[1].id);
      expect(await BaseFile.count()).to.equal(lengthBefore - 1);

      const result = await ctx.fileService.getSimpleFile(ctx.files[1].id);
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
        await ctx.fileService.deleteSimpleFile(ctx.files[2].id);
        assert(false, 'Expected FileService.deleteSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(error.message);
      }
      expect(await BaseFile.count()).to.equal(lengthBefore);

      const result = await ctx.fileService.getSimpleFile(ctx.files[2].id);
      expect(result).to.not.be.undefined;
    });
    it('should return when file does not exist', async () => {
      const lengthBefore = await BaseFile.count();

      await ctx.fileService.deleteSimpleFile(ctx.files[ctx.files.length - 1].id + 39);
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
        await ctx.fileService.deleteSimpleFile(ctx.files[2].id);
        assert(false, 'Expected FileService.deleteSimpleFile to have thrown an error');
      } catch (e) {
        expect(e.message).to.equal(error.message);
      }

      const result = await ctx.fileService.getSimpleFile(ctx.files[2].id);
      expect(result).to.not.be.undefined;
    });
  });

  describe('uploadProductImage', () => {
    it('should correctly upload file to product that has no image', async () => {
      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').resolves('fileLocation');
      stubs.push(saveFileStub);

      expect(ctx.products[3].image).to.be.undefined;
      const res: ProductImage = await ctx.fileService.uploadEntityImage(
        ctx.products[3], uploadedFile, ctx.users[0],
      );

      expect(res).to.exist;
      expect(saveFileStub).to.have.been.calledWith(
        'file.txt',
        uploadedFile.data,
      );
      expect(res.location).to.equal('fileLocation');
      expect(ctx.products[3].image).to.not.be.undefined;
      expect(ctx.products[3].image.id).to.equal(res.id);
    });

    it('should correctly upload file to product that already has image', async () => {
      const saveFileStub = sinon.stub(DiskStorage.prototype, 'saveFile').resolves('fileLocation');
      stubs.push(saveFileStub);
      const deleteFileStub = sinon.stub(DiskStorage.prototype, 'deleteFile').resolves(true);
      stubs.push(deleteFileStub);

      expect(ctx.products[0].image).to.not.be.undefined;
      const oldImage = ctx.products[0].image;

      const res: ProductImage = await ctx.fileService.uploadEntityImage(
        ctx.products[0], uploadedFile, ctx.users[0],
      );

      expect(res).to.exist;
      expect(saveFileStub).to.have.been.calledWith(
        'product-1.png',
        uploadedFile.data,
      );
      expect(deleteFileStub).to.have.been.calledWith(
        oldImage,
      );
      expect(res.location).to.equal('fileLocation');
      expect(ctx.products[0].image).to.not.be.undefined;
      expect(ctx.products[0].image.id).to.equal(res.id);
      expect(ctx.products[0].image.id).to.equal(oldImage.id);
    });
  });
});
