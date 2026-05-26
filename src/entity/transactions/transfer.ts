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
 * A `Transfer` is an explicit money movement on or off a SudoSOS account. Where a
 * {@link transactions!Transaction | Transaction} records products bought at a point of sale,
 * a transfer is the raw "X amount moves from A to B" record with no product line. Every
 * deposit, fine, payout, write-off, and invoice settlement becomes a Transfer.
 *
 * ### Open-ended endpoints
 * Both `from` and `to` are nullable, because some movements have no SudoSOS-side counterparty.
 * A Stripe top-up enters money from outside SudoSOS, so `from` is null and `to` is the user
 * being credited. A payout sends money out of SudoSOS, so `from` is the user being debited
 * and `to` is null. Internal movements (waiving fines, ad-hoc corrections) have both sides set.
 *
 * ### Who creates a transfer
 * Transfers are not usually written by hand. Each domain that moves money creates its own
 * record and keeps a OneToOne back-reference to the transfer it produced:
 *
 * - {@link stripe!StripeDeposit | StripeDeposit} -- after a successful Stripe PaymentIntent.
 * - {@link payout-requests!PayoutRequest | PayoutRequest} -- when a user-initiated payout is
 *   approved.
 * - {@link seller-payouts!SellerPayout | SellerPayout} -- periodic settlement to a container
 *   owner for sales made on their behalf.
 * - {@link invoicing!Invoice | Invoice} -- the debit that settles an invoice, plus an optional
 *   `creditTransfer` if the invoice is credit-noted.
 * - {@link fines!Fine | Fine} -- a single fine debit.
 * - {@link fines!UserFineGroup | UserFineGroup} -- as `waivedTransfer`, the credit that cancels
 *   a fine group.
 * - {@link write-offs!WriteOff | WriteOff} -- the debit that zeroes an irrecoverable balance.
 * - `InactiveAdministrativeCost` -- the recurring charge applied to inactive accounts.
 *
 * If none of those fit, an admin can create a transfer directly with a free-text `description`.
 *
 * ### VAT
 * Some transfers carry a {@link catalogue/vat!VatGroup | VatGroup} (e.g. invoice settlements,
 * inactive administrative costs). Most do not -- topping up balance is not a VAT-bearing event,
 * and neither is moving money between SudoSOS users.
 *
 * ### Balance impact
 * `amountInclVat` is credited to `to` and debited from `from`. If a side is null, only the
 * other side moves. {@link balance | Balance} treats transfers and transactions symmetrically
 * when computing a user's running total.
 *
 * ### PDF
 * `Transfer` is `PdfAble`. Some kinds (payouts, invoice settlements) produce a PDF receipt
 * via `GET /transfers/{id}/pdf` using `TransferPdfService`.
 *
 * @module transfers
 * @mergeTarget
 */

import {
  Column, Entity, JoinColumn, ManyToOne, OneToOne,
} from 'typeorm';
import { Dinero } from 'dinero.js';
import BaseEntity from '../base-entity';
import User from '../user/user';
import DineroTransformer from '../transformer/dinero-transformer';
import PayoutRequest from './payout/payout-request';
import SellerPayout from './payout/seller-payout';
import StripeDeposit from '../stripe/stripe-deposit';
import Invoice from '../invoices/invoice';
import Fine from '../fine/fine';
import UserFineGroup from '../fine/userFineGroup';
import VatGroup from '../vat-group';
import WriteOff from './write-off';
import InactiveAdministrativeCost from './inactive-administrative-cost';
import { UnstoredPdfAble } from '../file/pdf-able';
import TransferPdfService from '../../service/pdf/transfer-pdf-service';

/**
 * TypeORM entity for the `transfer` table. A single money movement on or off SudoSOS; one of
 * `from` or `to` may be null when the counterparty lives outside the system (a Stripe deposit,
 * a bank payout). The domain that originated the movement keeps a OneToOne back-reference,
 * which is how the type of a transfer (deposit, fine, payout, ...) is identified at read time.
 * @typedef {BaseEntity} Transfer
 * @property {User.model} from - The account from which the transfer is subtracted. Can be
 * null if money was deposited.
 * @property {User.model} to - The account to which the transaction is added. Can be null if
 * money was paid out.
 * @property {VatGroup.model} vat - The vat group of the transfer
 * @property {Dinero.model} amountInclVat.required - The amount of money transferred.
 * @property {integer} type.required - The type of transfer.
 * @property {string} description - If the transfer is of type 'custom', this contains a
 * description of the transfer.
 */
@Entity()
export default class Transfer extends UnstoredPdfAble(BaseEntity) {
  // These IDs are required, because TypeORM findOptions will convert the relations from LEFT JOIN
  // to INNER JOIN when having a where clause on a relational entity.
  @Column({ nullable: true })
  public fromId?: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'fromId' })
  public from?: User;

  // These IDs are required, because TypeORM findOptions will convert the relations from LEFT JOIN
  // to INNER JOIN when having a where clause on a relational entity.
  @Column({ nullable: true })
  public toId?: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'toId' })
  public to?: User;

  @Column({
    type: 'integer',
    transformer: DineroTransformer.Instance,
  })
  public amountInclVat: Dinero;

  @ManyToOne(() => VatGroup, { nullable: true })
  public vat?: VatGroup;

  @Column({
    nullable: true,
  })
  public description?: string;

  @OneToOne(() => PayoutRequest, (p) => p.transfer, { nullable: true })
  public payoutRequest: PayoutRequest | null;

  @OneToOne(() => StripeDeposit, (d) => d.transfer, { nullable: true })
  public deposit: StripeDeposit | null;

  @OneToOne(() => Invoice, (i) => i.transfer, { nullable: true })
  public invoice: Invoice | null;

  @OneToOne(() => Invoice, (i) => i.creditTransfer, { nullable: true })
  public creditInvoice: Invoice | null;

  @OneToOne(() => Fine, (f) => f.transfer, { nullable: true })
  public fine: Fine | null;

  @OneToOne(() => WriteOff, (w) => w.transfer, { nullable: true })
  public writeOff: WriteOff | null;

  @OneToOne(() => UserFineGroup, (g) => g.waivedTransfer, { nullable: true })
  public waivedFines: UserFineGroup | null;

  @OneToOne(() => InactiveAdministrativeCost, (a) => a.transfer, { nullable: true })
  public inactiveAdministrativeCost: InactiveAdministrativeCost | null;

  @OneToOne(() => SellerPayout, (s) => s.transfer, { nullable: true })
  public sellerPayout: SellerPayout | null;

  pdfService = new TransferPdfService();
}
