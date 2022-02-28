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
import { ValidationError } from '../../../helpers/specification-validation';

export const INVALID_PRODUCT_IDS = () => new ValidationError('Not all product IDs are valid.');

export const INVALID_CONTAINER_IDS = () => new ValidationError('Not all container IDs are valid.');

export const CONTAINER_VALIDATION_FAIL = () => new ValidationError('Container validation failed:');

export const PRODUCT_VALIDATION_FAIL = () => new ValidationError('Product validation failed:');

export const INVALID_DATE = () => new ValidationError('is not a valid Date.');

export const INVALID_DATE_DURATION = () => new ValidationError('End Date must be after the Start Date.');

export const INVALID_USER_ID = () => new ValidationError('must exist.');

export const ZERO_LENGTH_STRING = () => new ValidationError('must be a non-zero length string.');

export const INVALID_ACTIVE_USER_ID = () => new ValidationError('must exist and be active.');

export const INVALID_TRANSACTION_OWNER = () => new ValidationError('Not all transactions are owned by the debtor.');

export const INVALID_TRANSACTION_IDS = () => new ValidationError('Not all transaction IDs are valid.');

export const INVALID_INVOICE_ID = () => new ValidationError('Invoice with this ID does not exist.');

export const INVOICE_IS_DELETED = () => new ValidationError('Invoice is deleted.');
