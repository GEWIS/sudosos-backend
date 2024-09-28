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
 * This is the module page of the vat-group.
 *
 * @module catalogue/vat
 * @mergeTarget
 */

import { Column, Entity } from 'typeorm';
import BaseEntity from './base-entity';

/**
 * @typedef {BaseEntity} VatGroup
 * @property {string} name - Name of the VAT group
 * @property {number} percentage - VAT percentage
 * @property {boolean} deleted - Whether this group is soft-deleted
 * @property {boolean} hidden - Whether this group is hidden from transactions
 */

export enum VatDeclarationPeriod {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually',
}

@Entity()
export default class VatGroup extends BaseEntity {
  @Column()
  public name: string;

  // The Dutch tax system does not have VAT brackets with decimals in them, but
  // that might still happen (because politics), even though every programmer
  // in the country will probably hang themselves (including the Belastingdienst).
  // Better be prepared.
  @Column({ update: false, type: 'double' })
  public readonly percentage: number;

  @Column({ default: false })
  public deleted: boolean;

  @Column({ default: false })
  public hidden: boolean;
}
