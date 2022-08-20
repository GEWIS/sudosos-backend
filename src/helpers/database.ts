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
import { EntityManager, getManager } from 'typeorm';

/**
 * Takes a function with an EntityManager as first param and wraps it in a manager.
 * This ensures that if any of the DB transactions fail of the given transaction
 * function everything will be rolled back.
 * @param transactionFunction
 */
export default function wrapInManager<T>(transactionFunction:
(manager: EntityManager, ...arg: any[]) => Promise<T>): (...arg: any[]) => Promise<T> {
  return async (...arg: any[]) => Promise.resolve(getManager().transaction(
    async (manager) => Promise.resolve(transactionFunction(manager, ...arg)),
  ));
}
