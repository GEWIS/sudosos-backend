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
import Product from '../entity/product/product';
import ProductImage from '../entity/file/product-image';
import Banner from '../entity/banner';
import BannerImage from '../entity/file/banner-image';

/**
 *  Possible storage methods that can be used
 */
export type StorageMethod = 'disk';

export interface DownloadFileResponse {
  file: BaseFile,
  data: Buffer,
}

export default class FileService {
  private fileStorage: FileStorage;

  constructor(workdir?: string, storageMethod?: StorageMethod) {
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
  private async createFile(file: BaseFile, fileData: Buffer): Promise<BaseFile> {
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
  private async readFile(file: BaseFile): Promise<Buffer> {
    return this.fileStorage.getFile(file);
  }

  /**
   * Remove the given file from storage
   */
  private async removeFile(file: BaseFile) {
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

    return this.createFile(file, uploadedFile.data);
  }

  /**
   * Get the given simple file object and data from storage
   */
  public async getSimpleFile(id: number): Promise<DownloadFileResponse | undefined> {
    const file = await BaseFile.findOne({ where: { id } });

    if (!file) {
      return undefined;
    }

    const data = await this.readFile(file);
    return { file, data };
  }

  /**
   * Delete the simple file with given ID from storage and database
   */
  public async deleteSimpleFile(id: number): Promise<void> {
    const file = await BaseFile.findOne({ where: { id } });

    if (!file) return;

    await this.removeFile(file);
    await BaseFile.delete(file.id);
  }

  /**
   * Upload an entity image to the given entity and replace the old one, if it exists
   */
  public async uploadEntityImage(
    entity: Product | Banner, uploadedFile: UploadedFile, createdBy: User,
  ): Promise<ProductImage> {
    let entityImage = entity.image;

    if (entityImage == null) {
      entityImage = Object.assign(new BaseFile(), {
        downloadName: '',
        createdBy,
        location: '',
      });
      await ProductImage.save(entityImage);
    } else {
      // If the file does exist, we first have to remove it from storage
      await this.removeFile(entityImage);
    }
    // Store the new file in storage.
    entityImage = await this.createFile(entityImage, uploadedFile.data);

    // Save the file name as the download name.
    entityImage.downloadName = path.parse(entityImage.location).base;
    // eslint-disable-next-line no-param-reassign
    entity.image = entityImage;
    if (entity instanceof Product) {
      await ProductImage.save(entityImage);
    } else if (entity instanceof Banner) {
      await BannerImage.save(entityImage);
    } else {
      throw new Error('Given entity is not a Product or a Banner');
    }
    await entity.save();
    return entityImage;
  }

  /**
   * Delete entity file from database
   */
  public async deleteEntityFile(entityFile: ProductImage | BannerImage) {
    await this.removeFile(entityFile);
    await entityFile.remove();
  }
}
