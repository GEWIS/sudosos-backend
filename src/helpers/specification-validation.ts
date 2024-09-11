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
 * To allow for nested errors we need the notation of traversing through errors.
 * The abstraction is that we have a 'Joinable' such that items can be combined.
 */
export interface Joinable {
  value: any,

  join(right: Joinable): Joinable
}

/**
 * The ValidationError combines itself by simply concatenating the string values.
 */
export class ValidationError implements Joinable {
  value: string;

  constructor(message: string) {
    this.value = message;
  }

  join(right: ValidationError): ValidationError {
    if (this.value.length > 0) {
      this.value += ` ${right.value}`;
    } else {
      this.value = right.value;
    }
    return this;
  }
}

// Type representing a failed validation.
export type Fail<F> = { fail: F };
// Type representing a successful validation
export type Pass<P> = { pass: P };
// A validation can either Pass or Fail
export type Either<F, P> = Fail<F> | Pass<P>;
// A validation is a function that evaluates 'val' such that it either Passes or Fails.
export type ValidationRule<T, F> = (val: T) => Either<F, T> | Promise<Either<F, T>>;
// A subspecification is the notion that we can verify properties of an object
// by giving a key and the specification for that property.
export type SubSpecification<T, F> = [Specification<T[any], F>, keyof T, F];
// A specification is a array of rules or a subspecification for one of its parameters.
export type Specification<T, F> = (ValidationRule<T, F> | SubSpecification<T, F>)[];

// Test if result is fail.
export function isFail<L, R>(value: Either<L, R>): value is Fail<L> {
  return 'fail' in value;
}

// Test is if result is pass.
export function isPass<L, R>(value: Either<L, R>): value is Pass<R> {
  return 'pass' in value;
}

// Shorthand for making a Fail.
export function toFail<L>(fail: L): Fail<L> {
  return { fail };
}

// Shorthand for making a Pass.
export function toPass<R>(pass: R): Pass<R> {
  return { pass };
}

/**
 * Function that validates the given param against a specification.
 * @param target - Object to verify
 * @param specifications - Specification to use
 */
export async function validateSpecification<T, F extends Joinable>(target: T,
  specifications: Specification<T, F>): Promise<Either<Joinable, T>> {
  for (let i = 0; i < specifications.length; i += 1) {
    const spec = specifications[i];
    if (Array.isArray(spec)) {
      // Recurse on Specification
      const [subSpec, property, trace] = spec as SubSpecification<T, F>;
      // eslint-disable-next-line no-await-in-loop
      const result = await validateSpecification(target[property], subSpec);

      if (isFail(result)) {
        return toFail(trace.join(result.fail));
      }
    } else {
      // Check rule
      // eslint-disable-next-line no-await-in-loop
      const result = await spec(target);
      if (isFail(result)) return result;
    }
  }
  return toPass(target);
}

/**
 * Turn a specification for an property into a specification for an array of that property.
 * @param spec
 */
export function createArrayRule<T>(spec: Specification<T, Joinable>)
  : ValidationRule<T[], Joinable> {
  async function arrayTest(array: T[]): Promise< Fail<Joinable> | Pass<T[]>> {
    if (!array) return toPass(array);

    for (let i = 0; i < array.length; i++) {
      const valid = await validateSpecification(array[i], spec);
      if (isFail(valid)) return valid;
    }

    return toPass(array);
  }
  return arrayTest;
}
