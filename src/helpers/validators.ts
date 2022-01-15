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

import { InvoiceState } from '../entity/invoices/invoice-status';

/**
 * Returns whether the given object is a number
 * @param number any - The object to check
 * @param canBeUndefined boolean - Whether number is also allowed to be undefined
 */
export function isNumber(number: any, canBeUndefined?: boolean): boolean {
  if (canBeUndefined && number === undefined) return true;

  // If the object is of type number, simply return true
  if (typeof number === 'number') return true;

  // Parse the object to a number
  const p = Number(number);
  // If it is NaN, return false
  if (Number.isNaN(p)) return false;
  // If the length of the number is not equal to the length of the string, return false
  // Otherwise, return true
  return p.toString().length === number.length;
}

/**
 * Returns whether a given date string is actually a date
 * @param date string - The date string
 * @param canBeUndefined boolean - Whether number is also allowed to be undefined
 */
export function isDate(date: any, canBeUndefined?: boolean): boolean {
  if (canBeUndefined && date === undefined) return true;
  return !Number.isNaN(new Date(date).getTime());
}

/**
 * Converts the input to a number.
 * @param input - The input which should be converted.
 * @returns The parsed integer.
 * @throws TypeError - If the input is not a valid integer.
 */
export function asNumber(input: any): number {
  if (!isNumber(input, true)) throw new TypeError(`Input '${input}' is not a number.`);
  const parsed = (input ? Number(input) : undefined);
  return parsed;
}

/**
 * Converts the input to a Date object.
 * @param input - The input which should be converted.
 * @returns The parsed Date object.
 * @throws TypeError - If the input is not a valid date.
 */
export function asDate(input: any): Date {
  if (!isDate(input, true)) throw new TypeError(`Input '${input}' is not a date.`);
  const parsed = (input ? new Date(input) : undefined);
  return parsed;
}

/**
 * Converts the input to a Boolean
 * Returns true for 1, '1', true, 'true' (case-insensitive) . Otherwise false
 * @param input - The input which should be converted.
 * @returns The parsed Boolean
 */
export function asBoolean(input: any): boolean {
  if (typeof input === 'string') {
    return input.toLowerCase() === 'true' || !!+input;
  }

  return !!input;
}

/**
 * Converts the input to a InvoiceState
 * @param input - The input which should be converted.
 * @returns The parsed InvoiceState.
 * @throws TypeError - If the input is not a valid InvoiceState
 */
export function asInvoiceState(input: any): InvoiceState {
  const state: InvoiceState = InvoiceState[input as keyof typeof InvoiceState];
  if (state === undefined) {
    throw new TypeError(`Input '${input}' is not a valid InvoiceState.`);
  }
  return state;
}
