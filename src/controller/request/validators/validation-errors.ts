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
 */

import { ValidationError } from '../../../helpers/specification-validation';

export const INVALID_PRODUCT_ID = (id: number) => new ValidationError(`ID (${id}) is not a valid product id.`);

export const INVALID_PRODUCT_PRICE = () => new ValidationError('Price must be greater than zero');

export const INVALID_CONTAINER_ID = (id: number) => new ValidationError(`ID (${id}) is not a valid container id.`);

export const CONTAINER_VALIDATION_FAIL = () => new ValidationError('Container validation failed:');

export const PRODUCT_VALIDATION_FAIL = () => new ValidationError('Product validation failed:');

export const INVALID_DATE = () => new ValidationError('is not a valid Date.');

export const INVALID_DATE_DURATION = () => new ValidationError('End Date must be after the Start Date.');

export const INVALID_USER_ID = () => new ValidationError('must exist.');

export const INVALID_ORGAN_ID = () => new ValidationError('Owner must be of type ORGAN.');

export const ZERO_LENGTH_STRING = () => new ValidationError('must be a non-zero length string.');

export const MAX_STRING_SIZE = () => new ValidationError('is too long.');

export const DUPLICATE_TOKEN = () => new ValidationError('token already in use.');

export const INVALID_USER_TYPE = () => new ValidationError('type is not a valid UserType.');

export const INVALID_ACTIVE_USER_ID = () => new ValidationError('must exist and be active.');

export const INVALID_TRANSACTION_OWNER = () => new ValidationError('Not all transactions have the correct owner.');

export const INVALID_TRANSACTION_IDS = () => new ValidationError('Not all transaction IDs are valid.');

export const INVALID_INVOICE_ID = () => new ValidationError('Invoice with this ID does not exist.');

export const INVOICE_IS_DELETED = () => new ValidationError('Invoice is deleted.');

export const SAME_INVOICE_STATE = () => new ValidationError('Update state is same as current state.');

export const SUBTRANSACTION_ALREADY_INVOICED = (ids: number[]) => new ValidationError(`SubTransactions ${ids}: have already been invoiced.`);

export const CREDIT_CONTAINS_INVOICE_ACCOUNT = (ids: number[]) => new ValidationError(`Credit Invoice must not contain transactions belonging to Invoice Accounts. Relevant transactions: ${ids}`);

export const INVALID_PIN = () => new ValidationError('PIN is not 4 numbers');

export const WEAK_PASSWORD = () => new ValidationError('Password not strong enough.');

export const EMPTY_ARRAY = () => new ValidationError('is empty.');

export const INVALID_ROLE_ID = (id: number) => new ValidationError(`Role with ID ${id} does not exist.`);

export const INVALID_CUSTOM_ROLE_ID = (id: number) => new ValidationError(`Role with ID ${id} is a system default role.`);
