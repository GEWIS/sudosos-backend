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
 * This is the module page of the terms-of-service-response.
 *
 * @module terms-of-service
 */

import { TermsOfServiceStatus } from '../../entity/user/user';

/**
 * @typedef {object} TermsOfServiceResponse
 * @property {string} versionNumber.required - The terms of service version number.
 * @property {string} date.required - The date this version took effect.
 * @property {string} content.required - The terms of service content.
 */
export interface TermsOfServiceResponse {
  versionNumber: string;
  date: string;
  content: string;
}

/**
 * @typedef {object} UserTosAcceptanceResponse
 * @property {string} versionNumber.required - The accepted terms of service version number.
 * @property {string} acceptedAt.required - The date at which this version was accepted.
 */
export interface UserTosAcceptanceResponse {
  versionNumber: string;
  acceptedAt: string;
}

/**
 * enum:ACCEPTED,NOT_ACCEPTED,NOT_REQUIRED - The terms of service status of a user
 * @typedef {string} TermsOfServiceStatus
 */

/**
 * @typedef {object} UserTosResponse
 * @property {TermsOfServiceStatus} status.required - The TOS status of the user,
 * computed against the current TOS version.
 * @property {string} currentVersion.required - The current terms of service version number.
 * @property {Array<UserTosAcceptanceResponse>} acceptances.required - All TOS versions the user has accepted.
 */
export interface UserTosResponse {
  status: TermsOfServiceStatus;
  currentVersion: string;
  acceptances: UserTosAcceptanceResponse[];
}
