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


import { InvoiceState } from '../entity/invoices/invoice-status';
import { VatDeclarationPeriod } from '../entity/vat-group';
import { UserType } from '../entity/user/user';
import { Dinero } from 'dinero.js';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import { Availability } from '../entity/event/event-shift-answer';
import { EventType } from '../entity/event/event';

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
export function asNumber(input: any): number | undefined {
  if (!isNumber(input, true)) throw new TypeError(`Input '${input}' is not a number.`);
  return (input ? Number(input) : undefined);
}

/**
 * Converts the input to a Dinero object.
 * @param input - The input which should be converted.
 * @returns The parsed dinero object.
 * @throws TypeError - If the input is not a valid integer.
 */
export function asDinero(input: any): Dinero | undefined {
  const parsed = asNumber(input);
  return parsed !== undefined ? DineroTransformer.Instance.from(parsed) : undefined;
}

/**
 * Converts the input to a boolean
 * @param input - The input which should be converted.
 * @returns {true} - for 1, '1', true, 'true' (case-insensitive), otherwise false.
 */
export function asBoolean(input: any): boolean | undefined {
  if (input === undefined) return undefined;
  if (typeof input === 'string') {
    return input.toLowerCase() === 'true' || !!+input;
  }
  return !!input;
}

/**
 * Converts the input to a Date object.
 * @param input - The input which should be converted.
 * @returns The parsed Date object.
 * @throws TypeError - If the input is not a valid date.
 */
export function asDate(input: any): Date | undefined {
  if (!isDate(input, true)) throw new TypeError(`Input '${input}' is not a date.`);
  return (input ? new Date(input) : undefined);
}

/**
 * Converts the input to a InvoiceState
 * @param input - The input which should be converted.
 * @returns The parsed InvoiceState.
 * @throws TypeError - If the input is not a valid InvoiceState
 */
export function asInvoiceState(input: any): InvoiceState | undefined {
  if (!input) return undefined;
  const state: InvoiceState = InvoiceState[input as keyof typeof InvoiceState];
  if (state === undefined) {
    throw new TypeError(`Input '${input}' is not a valid InvoiceState.`);
  }
  return state;
}

/**
 * Converts the input to an VatDeclarationPeriod
 * @param input - The input which should be converted.
 * @returns VatDeclarationPeriod - The parsed VatDeclarationPeriod.
 * @throws TypeError - If the input is not a valid VatDeclarationPeriod
 */
export function asVatDeclarationPeriod(input: any): VatDeclarationPeriod | undefined {
  if (!input) return undefined;
  if (!Object.values(VatDeclarationPeriod).includes(input)) {
    throw new TypeError(`Input '${input}' is not a valid VatDeclarationPeriod.`);
  }
  return input;
}

/**
 * Converts the input to a UserType
 * @param input - The input which should be converted.
 * @returns The parsed UserType as a number representation.
 * @throws TypeError - If the input is not a valid UserType
 */
export function asUserType(input: any): UserType | undefined {
  if (input === undefined || input === null) return undefined;

  // Convert input to a number if it's a string representation of a number
  if (typeof input === 'string' && !isNaN(Number(input))) {
    input = Number(input);
  }

  // Check if input is now a number and a valid enum value
  if (typeof input === 'number' && UserType[input] !== undefined) {
    return input;
  }

  // Check if input is a string and a valid enum key
  const state: UserType = UserType[input as keyof typeof UserType];
  if (state === undefined) {
    throw new TypeError(`Input '${input}' is not a valid UserType.`);
  }

  return state;
}

/**
 * Converts the input to a shift availability
 * @param input - The input which should be converted.
 * @returns The parsed shift Availability.
 * @throws TypeError - If the input is not a valid Availability
 */
export function asShiftAvailability(input: any): Availability | undefined {
  if (!input) return undefined;
  const state: Availability = Availability[input as keyof typeof Availability];
  if (state === undefined) {
    throw new TypeError(`Input '${input}' is not a valid shift Availability.`);
  }
  return state;
}

/**
 * Converts the input to an EventType
 * @param input - The input which should be converted.
 * @returns The parsed EventType.
 * @throws TypeError - If the input is not a valid EventType
 */
export function asEventType(input: any): EventType | undefined {
  if (!input) return undefined;
  const state: EventType = EventType[input as keyof typeof EventType];
  if (state === undefined) {
    throw new TypeError(`Input '${input}' is not a valid EventType.`);
  }
  return state;
}

/**
 * Converts the input to a list of UserTypes
 * @param input
 * @throws TypeError - If the input is not a valid UserType
 */
export function asArrayOfUserTypes(input: any): UserType[] | undefined {
  if (!input) return undefined;
  let arr = input;
  if (!Array.isArray(input)) arr = [input];
  return arr.map((i: any) => asUserType(i));
}

/**
 * Converts the input to a list of numbers
 * @param input
 */
export function asArrayOfNumbers(input: any): number[] | undefined {
  if (!input) return undefined;
  if (!Array.isArray(input)) return undefined;
  return input.map((i) => asNumber(i));
}

/**
 * Converts the input to a list of dates
 * @param input
 * @throws TypeError - If array contains one or more invalid or undefined dates
 */
export function asArrayOfDates(input: any): Date[] | undefined {
  if (!input) return undefined;
  if (!Array.isArray(input)) input = [input];
  const dates = input.map((i: any[]) => asDate(i));
  if (dates.some((d: (Date | undefined)[]) => d === undefined)) throw new TypeError('Array contains invalid date');
  return dates;
}
