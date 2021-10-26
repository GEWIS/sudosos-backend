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

import { UploadedFile } from 'express-fileupload';
import path from 'path';
import { DiskStorage, FileStorage, SIMPLE_FILE_LOCATION } from '../files/storage';
import BaseFile from '../entity/file/base-file';
import SimpleFileRequest from '../controller/request/simple-file-request';
import User from '../entity/user/user';

/**
 * Types of files that SudoSOS currently uses. Currently, this is only 'simple',
 * but this might be extended with 'productImage' and/or 'invoice'
 */
export type FileType = 'simple';

export interface DownloadFileResponse {
  file: BaseFile,
  data: Buffer,
}

export default class FileService {
  private fileStorage: FileStorage;

  constructor(workdir?: string, storageMethod?: string) {
    switch (storageMethod ?? process.env.FILE_STORAGE_METHOD) {
      case undefined:
      case '':
      case 'disk':
        this.fileStorage = new DiskStorage(workdir ?? SIMPLE_FILE_LOCATION);
        break;
      default:
        throw new TypeError(`Unknown file storage method: ${process.env.FILE_STORAGE_METHOD}`);
    }
  }

  /**
   * Create a new file in storage, given the provided parameters
   */
  private async createFile(
    entity: FileType, file: BaseFile, fileData: Buffer,
  ): Promise<BaseFile> {
    let location: string;
    try {
      location = await this.fileStorage.saveFile(file.downloadName, fileData);
    } catch (error) {
      await BaseFile.delete(file.id);
      throw new Error(error);
    }

    // eslint-disable-next-line no-param-reassign
    file.location = location;

    try {
      await file.save();
    } catch (error) {
      await this.fileStorage.deleteFile(file);
      await BaseFile.delete(file.id);
      throw new Error(error);
    }

    return file;
  }

  /**
   * Read and return the given file from storage
   */
  private async readFile(entity: FileType, file: BaseFile): Promise<Buffer> {
    return this.fileStorage.getFile(file);
  }

  /**
   * Remove the given file from storage
   */
  private async removeFile(entity: FileType, file: BaseFile) {
    await this.fileStorage.deleteFile(file);
  }

  /**
   * Upload a simple file to the database and put in storage
   */
  public async uploadSimpleFile(
    createdBy: User, uploadedFile: UploadedFile, fileEntity: SimpleFileRequest,
  ) {
    const fileExtension = path.extname(uploadedFile.name);

    const file = Object.assign(new BaseFile(), {
      downloadName: `${fileEntity.name}${fileExtension}`,
      createdBy,
      location: '',
    });
    await file.save();

    return this.createFile('simple', file, uploadedFile.data);
  }

  /**
   * Get the given simple file object and data from storage
   */
  public async getSimpleFile(id: number): Promise<DownloadFileResponse | undefined> {
    const file = await BaseFile.findOne(id);

    if (!file) {
      return undefined;
    }

    const data = await this.readFile('simple', file);
    return { file, data };
  }

  /**
   * Delete the simple file with given ID from storage and database
   */
  public async deleteSimpleFile(id: number): Promise<void> {
    const file = await BaseFile.findOne(id);

    if (!file) return;

    await this.removeFile('simple', file);
    await BaseFile.delete(file.id);
  }
}
