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
 * This is the module page of the simple-file-response.
 *
 * @module internal/files
 */

import BaseResponse from './base-response';
import { UserResponse } from './user-response';

/**
 * @typedef {allOf|BaseResponse} SimpleFileResponse
 * @property {string} downloadName.required - The filename of the file
 * @property {string} location.required - The location of the file in storage
 * @property {UserResponse} createdBy.required - The user who created this file
 */
export interface SimpleFileResponse extends BaseResponse {
  downloadName: string;
  location: string;
  createdBy: UserResponse;
}

/**
 * @typedef {object} PdfUrlResponse
 * @property {string} pdf - The pdf url
 */
export interface PdfUrlResponse {
  pdf: string;
}
