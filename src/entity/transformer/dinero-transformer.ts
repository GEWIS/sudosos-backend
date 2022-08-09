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
/* eslint-disable class-methods-use-this */
import assert from 'assert';
import dinero, { Dinero } from 'dinero.js';
import { ValueTransformer } from 'typeorm';

/**
 * A singleton class for converting monetary Dinero values from and to
 * integer database representation.
 */
export default class DineroTransformer implements ValueTransformer {
  private static instance: DineroTransformer;

  /**
   * Private constructor for Singleton pattern.
   */
  private constructor() { }

  /**
   * Get Singleton instance of the transformer.
   */
  public static get Instance() {
    if (!this.instance) {
      this.instance = new DineroTransformer();
    }
    return this.instance;
  }

  /**
   * Converts a monetary value to it's Dinero object representation.
   * @param value - the monetary value represented as integer.
   * @throws {TypeError} if value is non-integer.
   */
  public from(value: number | string | null): Dinero {
    if (value == null) return dinero({ amount: 0 });
    const amount = typeof value === 'string' ? parseInt(value, 10) : value;
    return dinero({ amount });
  }

  /**
   * Converts a monetary value to it's database integer representation.
   * @param value - the monetary value represented in a Dinero object.
   * @throws {AssertionError} if precision is not the default precision.
   * @throws {AssertionError} if currency is not the default currency.
   */
  public to(value: Dinero): number {
    assert(value.getPrecision() === dinero.defaultPrecision, 'Unsupported precision supplied.');
    assert(value.getCurrency() === dinero.defaultCurrency, 'Unsupported currency supplied.');
    return value.getAmount();
  }
}
