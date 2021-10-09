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

export type FileType = 'simple';

export interface DownloadFileResponse {
  file: BaseFile,
  data: Buffer,
}

export default class FileService {
  /**
   * Returns the appropriate storage handler with the given entity
   * @param entity Entity to which this file belongs
   */
  private static getFileStorage(entity: FileType): FileStorage {
    switch (process.env.FILE_STORAGE_METHOD) {
      case undefined:
      case '':
      case 'disk':
        switch (entity) {
          case 'simple':
            return new DiskStorage(SIMPLE_FILE_LOCATION);
          default:
            throw new TypeError(`Unknown entity file type: ${entity}`);
        }
      default:
        throw new TypeError(`Unknown file storage method: ${process.env.FILE_STORAGE_METHOD}`);
    }
  }

  /**
   * Upload a file to the database and put in storageS
   */
  public static async uploadSimpleFile(
    entity: FileType, createdBy: User, uploadedFile: UploadedFile, fileEntity: SimpleFileRequest,
  ) {
    const storage = this.getFileStorage(entity);

    const fileExtension = path.extname(uploadedFile.name);

    const file = Object.assign(new BaseFile(), {
      downloadName: `${fileEntity.name}${fileExtension}`,
      createdBy,
      location: '',
    });
    await file.save();

    let location: string;
    try {
      location = await storage.saveFile(uploadedFile.name, uploadedFile.data);
    } catch (error) {
      await BaseFile.delete(file.id);
      throw new Error(error);
    }

    file.location = location;

    try {
      await file.save();
    } catch (error) {
      await storage.deleteFile(file);
      await BaseFile.delete(file.id);
      throw new Error(error);
    }

    return file;
  }

  /**
   * Get the given file object and data from storage
   */
  public static async getSimpleFile(
    entity: FileType, id: number,
  ): Promise<DownloadFileResponse | undefined> {
    const storage = this.getFileStorage(entity);

    const file = await BaseFile.findOne(id);

    if (!file) {
      return undefined;
    }

    const data = await storage.getFile(file);
    return { file, data };
  }

  /**
   * Delete the file with given ID from storage and database
   */
  public static async deleteSimpleFile(entity: FileType, id: number): Promise<void> {
    const storage = this.getFileStorage(entity);

    const file = await BaseFile.findOne(id);

    if (!file) return;

    await storage.deleteFile(file);
    await BaseFile.delete(file.id);
  }
}
