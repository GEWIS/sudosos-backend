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
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import * as fs from 'fs';
import FileStorage from './file-storage';
import BaseFile from '../../entity/file/base-file';

export default class DiskStorage implements FileStorage {
  private workdir: string;

  constructor(workdir: string) {
    this.workdir = workdir;
  }

  /**
   * Returns an uuidv4 string.
   * This separate function is created to make testing easier.
   */
  private static getRandomName() {
    return uuidv4();
  }

  async saveFile(fileName: string, fileData: Buffer): Promise<string> {
    const fileExtension = path.extname(fileName);
    const randomFileName = `${DiskStorage.getRandomName()}${fileExtension}`;
    const fileLocation = path.join(__dirname, '/../../..', this.workdir, randomFileName);

    return new Promise(((resolve, reject) => {
      fs.writeFile(fileLocation, fileData, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(fileLocation);
      });
    }));
  }

  getFile(file: BaseFile): Promise<Buffer> {
    return Promise.resolve(undefined);
  }

  deleteFile(file: BaseFile): Promise<void> {
    return Promise.resolve(undefined);
  }
}
