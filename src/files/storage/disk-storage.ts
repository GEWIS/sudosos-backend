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

/**
 * This is the module page of the disk-storage.
 *
 * @module internal/files/storage
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import * as fs from 'fs';
import FileStorage from './file-storage';
import BaseFile from '../../entity/file/base-file';

export default class DiskStorage implements FileStorage {
  private readonly workdir: string;

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

  public validateFileLocation(location: string): void {
    const directory = path.basename(path.dirname(location));
    const expected = path.basename(path.resolve(this.workdir));
    if (expected !== directory) {
      throw new TypeError(`Given file is not located in the expected directory. Expected: ${expected}, actual: ${directory}`);
    }
  }

  private resolveLocation(location: string): string {
    return path.resolve(this.workdir, path.basename(location));
  }

  private static readFile(location: string) {
    return fs.readFileSync(location);
  }

  private static writeFile(location: string, data: Buffer) {
    return fs.writeFileSync(location, data);
  }

  private static removeFile(location: string) {
    return fs.rmSync(location);
  }

  private static fileExists(location: string): boolean {
    return fs.existsSync(location);
  }

  async saveFile(fileName: string, fileData: Buffer): Promise<string> {
    const fileExtension = path.extname(fileName);
    const randomFileName = `${DiskStorage.getRandomName()}${fileExtension}`;
    const fileLocation = path.resolve(this.workdir, randomFileName);

    DiskStorage.writeFile(fileLocation, fileData);
    return Promise.resolve(fileLocation);
  }

  getFile(file: BaseFile): Promise<Buffer> {
    this.validateFileLocation(file.location);
    const location = this.resolveLocation(file.location);
    if (!DiskStorage.fileExists(location)) {
      return Promise.reject(new Error(`Given file does not exist on disk: ${location}`));
    }

    const data = DiskStorage.readFile(location);
    return Promise.resolve(data);
  }

  public deleteFile(file: BaseFile): Promise<boolean> {
    const location = this.resolveLocation(file.location);
    this.validateFileLocation(location);
    if (!DiskStorage.fileExists(location)) {
      return Promise.resolve(false);
    }

    DiskStorage.removeFile(location);
    return Promise.resolve(true);
  }
}
