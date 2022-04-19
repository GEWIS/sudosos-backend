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

export interface Joinable {
  value: any,

  join(right: Joinable): Joinable
}

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

export type Fail<F> = { fail: F };
export type Pass<P> = { pass: P };
export type Either<F, P> = Fail<F> | Pass<P>;
export type ValidationRule<T, F> = (val: T) => Either<F, T> | Promise<Either<F, T>>;
export type SubSpecification<T, F> = [Specification<T[any], F>, keyof T, F];
export type Specification<T, F> = (ValidationRule<T, F> | SubSpecification<T, F>)[];

export function isFail<L, R>(value: Either<L, R>): value is Fail<L> {
  return 'fail' in value;
}

export function isPass<L, R>(value: Either<L, R>): value is Pass<R> {
  return 'pass' in value;
}

export function toFail<L>(fail: L): Fail<L> {
  return { fail };
}

export function toPass<R>(pass: R): Pass<R> {
  return { pass };
}

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

export function createArrayRule<T>(spec: Specification<T, Joinable>)
  : ValidationRule<T[], Joinable> {
  async function arrayTest(array: T[]): Promise< Fail<Joinable> | Pass<T[]>> {
    const results: Either<Joinable, T>[] = [];
    const promises: Promise<void>[] = [];
    if (!array) return toPass(array);

    array.forEach((entry) => {
      promises.push(validateSpecification(entry, spec).then((res) => {
        results.push(res);
      }));
    });
    await Promise.all(promises);
    const hasFail = results.find((item) => isFail(item));

    if (hasFail && isFail(hasFail)) return hasFail;
    return toPass(array);
  }
  return arrayTest;
}
