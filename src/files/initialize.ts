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
import * as fs from 'fs';
import path from 'path';
import { ROOT_FILE_LOCATION, SIMPLE_FILE_LOCATION } from './storage';

/**
 * Create all folders necessary to store files locally on disk
 */
export default function initializeDiskStorage() {
  if (!fs.existsSync(path.join(__dirname, '/../..', ROOT_FILE_LOCATION))) {
    fs.mkdirSync(path.join(__dirname, '/../..', ROOT_FILE_LOCATION));
  }

  if (!fs.existsSync(path.join(__dirname, '/../..', SIMPLE_FILE_LOCATION))) {
    fs.mkdirSync(path.join(__dirname, '/../..', SIMPLE_FILE_LOCATION));
  }
}
