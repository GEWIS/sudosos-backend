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
 * A `VAT group` is a named VAT rate that products reference. In the Netherlands the common ones
 * are "Hoog 21%", "Laag 9%", and "Geen 0%", but SudoSOS stores the percentage as a `double` —
 * Dutch VAT has never had decimal brackets, but politics can change that at any time and the
 * schema would rather not need a migration the day it does.
 *
 * ### Immutable rate, mutable label
 * `VatGroup.percentage` is declared `update: false`: once a group exists, its rate is fixed.
 * To "change" a rate, create a new group and migrate products to reference it. Name, `deleted`,
 * and `hidden` are the only mutable fields. This keeps historical accounting stable — a product
 * that sold at 21% yesterday cannot retroactively become 9%.
 *
 * ### Deleted vs. hidden
 * Two flags control visibility, and they solve different problems:
 * - `deleted` — soft deletion. A group can only be marked deleted once no products reference it
 *   (see `canSetVatGroupToDeleted`). The row stays in the database so historical
 *   {@link transactions/sub-transactions!SubTransaction | SubTransaction} rows and revisions keep
 *   resolving.
 * - `hidden` — excludes the group from user-facing pickers without affecting historical data.
 *   Useful for parking a rate that is no longer in use but still needs to compute for past
 *   transactions.
 *
 * ### Linkage to products
 * Every {@link catalogue/products!ProductRevision | ProductRevision} references a VatGroup.
 * Because revisions are immutable and pin the rate at transaction time, a product that is later
 * moved to a different VAT group does not rewrite history — old sub-transaction rows keep
 * resolving to the revision they were created against.
 *
 * ### VAT declarations (Belastingdienst)
 * `VatGroupService.calculateVatDeclaration` aggregates VAT collected per group per period, so the
 * treasurer can file with the Dutch tax authority. The cadence (monthly / quarterly / annually)
 * is picked via {@link VatDeclarationPeriod}, matching the options the Belastingdienst offers.
 *
 * For API interactions, refer to the [Swagger Documentation](https://sudosos.gewis.nl/api/api-docs/#/vatGroups).
 *
 * @module catalogue/vat
 * @mergeTarget
 */

import { Column, Entity } from 'typeorm';
import BaseEntity from './base-entity';

/**
 * Cadence of Dutch VAT declarations filed with the Belastingdienst.
 */
export enum VatDeclarationPeriod {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually',
}

/**
 * TypeORM entity for the `vat_groups` table.
 * Holds a named VAT rate that products reference. The `percentage` is immutable after creation;
 * to change a rate, create a new group.
 * @typedef {BaseEntity} VatGroup
 * @property {string} name - Name of the VAT group
 * @property {number} percentage - VAT percentage
 * @property {boolean} deleted - Whether this group is soft-deleted
 * @property {boolean} hidden - Whether this group is hidden from transactions
 */
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
