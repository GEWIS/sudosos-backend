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
 *
 *  @license
 */

/**
 * This is the module page of the file-storage.
 *
 * @module files/storage
 */

import BaseFile from '../../entity/file/base-file';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default abstract class FileStorage {
  /**
   * Save a file with the given name to storage
   * @return The location of the file
   */
  public abstract saveFile(fileName: string, fileData: Buffer): Promise<string>;

  /**
   * Get the file from storage as a buffer object
   * @throws Error when file could not be found in storage
   */
  public abstract getFile(file: BaseFile): Promise<Buffer>;

  /**
   * Delete the file from the storage system
   * @returns true when file was deleted, false when file does not exist in storage
   * @throws Error when file could not be deleted
   */
  public abstract deleteFile(file: BaseFile): Promise<boolean>;
}
