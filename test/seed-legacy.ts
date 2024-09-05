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

import dinero from 'dinero.js';
import { addDays } from 'date-fns';
import * as fs from 'fs';
import path from 'path';
import Container from '../src/entity/container/container';
import ContainerRevision from '../src/entity/container/container-revision';
import PointOfSale from '../src/entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../src/entity/point-of-sale/point-of-sale-revision';
import Product from '../src/entity/product/product';
import ProductCategory from '../src/entity/product/product-category';
import ProductRevision from '../src/entity/product/product-revision';
import SubTransaction from '../src/entity/transactions/sub-transaction';
import SubTransactionRow from '../src/entity/transactions/sub-transaction-row';
import Transaction from '../src/entity/transactions/transaction';
import User, { UserType } from '../src/entity/user/user';
import Transfer from '../src/entity/transactions/transfer';
import Banner from '../src/entity/banner';
import BannerImage from '../src/entity/file/banner-image';
import { BANNER_IMAGE_LOCATION } from '../src/files/storage';
import StripeDeposit from '../src/entity/stripe/stripe-deposit';
import StripePaymentIntentStatus, { StripePaymentIntentState } from '../src/entity/stripe/stripe-payment-intent-status';
import DineroTransformer from '../src/entity/transformer/dinero-transformer';
import PayoutRequest from '../src/entity/transactions/payout/payout-request';
import PayoutRequestStatus, { PayoutRequestState } from '../src/entity/transactions/payout/payout-request-status';
import Invoice from '../src/entity/invoices/invoice';
import InvoiceEntry from '../src/entity/invoices/invoice-entry';
import InvoiceStatus, { InvoiceState } from '../src/entity/invoices/invoice-status';
import Event, { EventType } from '../src/entity/event/event';
import EventShift from '../src/entity/event/event-shift';
import EventShiftAnswer, { Availability } from '../src/entity/event/event-shift-answer';
import seedGEWISUsers from '../src/gewis/database/seed';
import PinAuthenticator from '../src/entity/authenticator/pin-authenticator';
import VatGroup from '../src/entity/vat-group';
import LocalAuthenticator from '../src/entity/authenticator/local-authenticator';
import UserFineGroup from '../src/entity/fine/userFineGroup';
import FineHandoutEvent from '../src/entity/fine/fineHandoutEvent';
import Fine from '../src/entity/fine/fine';
import { calculateBalance } from './helpers/balance';
import GewisUser from '../src/gewis/entity/gewis-user';
import AssignedRole from '../src/entity/rbac/assigned-role';
import Role from '../src/entity/rbac/role';
import generateBalance from './helpers/test-helpers';
import WriteOff from '../src/entity/transactions/write-off';
import StripePaymentIntent from '../src/entity/stripe/stripe-payment-intent';
import {
  ContainerSeeder,
  PointOfSaleSeeder,
  ProductCategorySeeder,
  ProductSeeder,
  UserSeeder,
  VatGroupSeeder,
} from './seed';

function getDate(startDate: Date, endDate: Date, i: number): Date {
  const diff = endDate.getTime() - startDate.getTime();
  if (diff <= 0) throw new Error('startDate should be before endDate');

  return new Date(startDate.getTime() + (startDate.getTime() * i ) % diff);
}


export function defineInvoiceEntries(invoiceId: number, startEntryId: number,
  transactions: Transaction[]): { invoiceEntries: InvoiceEntry[], cost: number } {
  const invoiceEntries: InvoiceEntry[] = [];
  let entryId = startEntryId;
  const subTransactions = (
    transactions.map((t) => t.subTransactions).reduce((acc, tSub) => acc.concat(tSub)));

  const subTransactionRows = (
    subTransactions.map(
      (tSub) => tSub.subTransactionRows,
    ).reduce((acc, tSubRow) => acc.concat(tSubRow)));

  let cost = 0;
  for (let i = 0; i < subTransactionRows.length; i += 1) {
    cost += subTransactionRows[i].amount * subTransactionRows[i].product.priceInclVat.getAmount();
    invoiceEntries.push(Object.assign(new InvoiceEntry(), {
      id: entryId,
      invoice: invoiceId,
      description: subTransactionRows[i].product.name,
      amount: subTransactionRows[i].amount,
      priceInclVat: subTransactionRows[i].product.priceInclVat,
      vatPercentage: subTransactionRows[i].product.vat.percentage,
    }));
    entryId += 1;
  }
  return { invoiceEntries, cost };
}

export async function seedInvoices(users: User[], transactions: Transaction[]): Promise<{
  invoices: Invoice[],
  invoiceTransfers: Transfer[],
}> {
  let invoices: Invoice[] = [];

  const invoiceUsers = users.filter((u) => u.type === UserType.INVOICE);
  let invoiceTransfers: Transfer[] = [];
  let invoiceEntry: InvoiceEntry[] = [];

  for (let i = 0; i < invoiceUsers.length; i += 1) {
    const invoiceTransactions = transactions.filter((t) => t.from.id === invoiceUsers[i].id);
    const to: User = invoiceUsers[i];

    const { invoiceEntries, cost } = (
      defineInvoiceEntries(i + 1, 1 + invoiceEntry.length, invoiceTransactions));
    // Edgecase in the seeder
    if (cost === 0) {
      // eslint-disable-next-line no-continue
      continue;
    }

    invoiceEntry = invoiceEntry.concat(invoiceEntries);

    const transfer = Object.assign(new Transfer(), {
      from: null,
      to,
      amountInclVat: dinero({
        amount: cost,
      }),
      description: `Invoice Transfer for ${cost}`,
    });
    await Transfer.save(transfer);

    const invoice = Object.assign(new Invoice(), {
      id: i + 1,
      to,
      addressee: `Addressed to ${to.firstName}`,
      reference: `BAC-${i}`,
      city: `city-${i}`,
      country: `country-${i}`,
      postalCode: `postalCode-${i}`,
      street: `street-${i}`,
      description: `Invoice #${i}`,
      transfer,
      date: new Date(),
      invoiceEntries,
      invoiceStatus: [],
    });
    transfer.invoice = invoice;

    await Invoice.save(invoice);
    let status = Object.assign(new InvoiceStatus(), {
      id: i + 1,
      invoice,
      changedBy: users[i],
      state: InvoiceState.CREATED,
      dateChanged: addDays(new Date(2020, 0, 1), 2 - (i * 2)),
    });
    invoice.invoiceStatus.push(status);
    invoices = invoices.concat(invoice);
    invoiceTransfers = invoiceTransfers.concat(transfer);
  }

  await Invoice.save(invoices);
  await InvoiceEntry.save(invoiceEntry);

  for (let i = 0; i < invoices.length; i += 1) {
    if (i % 2 === 0) {
      const current = invoices[i].invoiceStatus[0].changedBy.id;
      const status = Object.assign(new InvoiceStatus(), {
        invoice: invoices[i],
        changedBy: current,
        state: InvoiceState.SENT,
        dateChanged: addDays(new Date(2020, 0, 1), 2 - (i * 2)),
      });
      invoices[i].invoiceStatus.push(status);
      await Invoice.save(invoices[i]);
    }
  }


  return { invoices, invoiceTransfers };
}

/**
 * Seeds a default dataset of borrelSchemaShifts and stores them in the database
 */
async function seedEventShifts() {
  const roles = await Role.save([{
    name: 'BAC',
  }, {
    name: 'BAC feut',
  }, {
    name: 'BAC PM',
  }, {
    name: 'Bestuur',
  }, {
    name: 'Kasco',
  }]);

  const eventShifts = await EventShift.save([{
    name: 'Borrelen',
    roles: [roles[0], roles[1]],
  }, {
    name: 'Portier',
    roles: [roles[0], roles[1]],
  }, {
    name: 'Bier halen voor Job en Sjoerd',
    roles: [roles[1]],
  }, {
    name: 'Roy slaan',
    roles: [],
  }, {
    name: '900 euro kwijtraken',
    roles: [roles[0], roles[2]],
  }, {
    name: 'Wassen',
    roles: [roles[3]],
    deletedAt: new Date(),
  }]);
  return {
    roles,
    eventShifts,
  };
}

function createEventShiftAnswer(user: User, event: Event, shift: EventShift, type: number) {
  const availabilities = [Availability.YES, Availability.MAYBE, Availability.NO, Availability.LATER, Availability.NA, null];

  const answer: EventShiftAnswer = Object.assign(new EventShiftAnswer(), {
    user,
    availability: availabilities[type + 1 % availabilities.length],
    selected: false,
    eventId: event.id,
    shiftId: shift.id,
  });
  return EventShiftAnswer.save(answer);
}

export async function seedEvents(users: User[]) {
  const events: Event[] = [];
  const { eventShifts, roles } = await seedEventShifts();

  const roleAssignments = (await Promise.all(users.map(async (user, i) => {
    if (i % 3 === 0) return undefined;
    return AssignedRole.save({
      user,
      role: roles[i % 5],
    });
  }))).filter((r) => r != null);

  const eventShiftAnswers: EventShiftAnswer[] = [];
  for (let i = 1; i < eventShifts.length; i += 1) {
    // const startDate = getRandomDate(new Date(), new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 365));
    const startDate = new Date(new Date().getTime() + ((i * 1000000) % (3600 * 24 * 365)) * 1000 + 60000);
    startDate.setMilliseconds(0);
    // Add 2,5 hours
    const endDate = new Date(startDate.getTime() + (1000 * 60 * 60 * 2.5));
    endDate.setMilliseconds(0);

    const event = Object.assign(new Event(), {
      name: `${i}-Testborrel-${i}`,
      createdBy: roleAssignments[i].user,
      startDate,
      endDate,
      type: EventType.BORREL,
      shifts: [],
      id: i,
    });
    await Event.save(event);

    const eventShifts1: EventShift[] = [];
    const eventShiftAnswers1: EventShiftAnswer[] = [];
    for (let j = 0; j < ((i + 1) * 243) % 4; j += 1) {
      const shift = eventShifts[((i + j) * 13) % (eventShifts.length)];
      const usersWithRole = roleAssignments.filter((r) => shift.roles.some((r2) => r2.id === r.roleId));
      await Promise.all(usersWithRole.map(async (r, k) => {
        const answer = await createEventShiftAnswer(r.user, event, shift, k);
        answer.event = event;
        answer.shift = shift;
        eventShifts1.push(shift);
        eventShiftAnswers.push(answer);
        eventShiftAnswers1.push(answer);
      }));
    }

    event.shifts = eventShifts1.filter((s, j, all) => j === all.findIndex((s2) => s.id === s2.id));
    await event.save();

    event.answers = eventShiftAnswers1;
    events.push(event);
  }

  return { roles, roleAssignments, events, eventShifts, eventShiftAnswers };
}

/**
 * Defines transaction objects subtransactions and rows based on the parameters passed.
 * A deterministic subset of the containers and products will be used for every transaction.
 *
 * @param start - The number of transactions that already exist.
 * @param startSubTransaction - The number of subtransactions that already exist.
 * @param startRow - The number of subtransaction rows that already exist.
 * @param count - The number of transactions to generate.
 * @param pointOfSale - The point of sale for which to generate transactions.
 * @param from - The user that buys stuff from the point of sale.
 * @param createdBy - The user that has created the transaction for the 'from' user, or null.
 * @param createdAt - Date of transaction creation
 */
export function defineTransactions(
  start: number,
  startSubTransaction: number,
  startRow: number,
  count: number,
  pointOfSale: PointOfSaleRevision,
  from: User,
  createdBy: User,
  createdAt?: Date,
): Transaction[] {
  const transactions: Transaction[] = [];
  let subTransactionId = startSubTransaction;
  let rowId = startRow;

  for (let nr = 1; nr <= count; nr += 1) {
    const transaction = Object.assign(new Transaction(), {
      id: start + nr,
      createdAt,
      from,
      createdBy,
      pointOfSale,
      subTransactions: [],
    }) as Transaction;
    transactions.push(transaction);

    for (let c = 0; c < pointOfSale.containers.length; c += 1) {
      const container = pointOfSale.containers[c];

      // Only define some of the containers.
      if ((start + 5 * c + 13 * nr) % 3 === 0) {
        subTransactionId += 1;
        const subTransaction = Object.assign(new SubTransaction(), {
          id: subTransactionId,
          createdAt,
          to: pointOfSale.pointOfSale.owner,
          transaction,
          container,
          subTransactionRows: [],
        });
        transaction.subTransactions.push(subTransaction);

        for (let p = 0; p < container.products.length; p += 1) {
          // Only define some of the products.
          if ((3 * start + 7 * c + 17 * nr + p * 19) % 5 === 0) {
            rowId += 1;
            const row = Object.assign(new SubTransactionRow(), {
              id: rowId,
              createdAt,
              subTransaction,
              product: container.products[p],
              amount: ((start + c + p + nr) % 3) + 1,
            });
            subTransaction.subTransactionRows.push(row);
          }
        }
      }
    }
  }

  return transactions;
}

/**
 * Seeds a default dataset of transactions, based on the supplied user and point of sale
 * revision dataset. Every point of sale revision will recevie transactions.
 *
 * @param users - The dataset of users to base the point of sale dataset on.
 * @param pointOfSaleRevisions
 *  - The dataset of point of sale revisions to base the transaction dataset on.
 * @param beginDate - The lower bound for the range of transaction creation dates
 * @param endDate - The upper bound for the range of transaction creation dates
 * @param nrMultiplier - Multiplier for the number of transactions to create
 */
export async function seedTransactions(
  users: User[],
  pointOfSaleRevisions: PointOfSaleRevision[],
  beginDate?: Date,
  endDate?: Date,
  nrMultiplier: number = 1,
): Promise<{
    transactions: Transaction[],
    subTransactions: SubTransaction[],
  }> {
  let transactions: Transaction[] = [];
  let startSubTransaction = 0;
  let startRow = 0;

  for (let i = 0; i < pointOfSaleRevisions.length; i += 1) {
    const pos = pointOfSaleRevisions[i];

    const from = users[(i + pos.pointOfSale.id * 5 + pos.revision * 7) % users.length];
    const createdBy = (i + pos.revision) % 3 !== 0
      ? from
      : users[(i * 5 + pos.pointOfSale.id * 7 + pos.revision) % users.length];
    let createdAt: Date;
    if (beginDate && endDate) createdAt = getDate(beginDate, endDate, i);
    const trans = defineTransactions(
      transactions.length,
      startSubTransaction,
      startRow,
      Math.round(2 * nrMultiplier),
      pos,
      from,
      createdBy,
      createdAt,
    );

    // Update the start id counters.
    for (let a = 0; a < trans.length; a += 1) {
      const t = trans[a];
      startSubTransaction += t.subTransactions.length;
      for (let b = 0; b < t.subTransactions.length; b += 1) {
        const s = t.subTransactions[b];
        startRow += s.subTransactionRows.length;
      }
    }

    // First, save all transactions.
    await Transaction.save(trans)
      .then(async () => {
        // Then, save all subtransactions for the transactions.
        // const subPromises: Promise<any>[] = [];
        for (let j = trans.length - 1; j >= 0; j--) {
          await SubTransaction.save(trans[j].subTransactions);
        }
      }).then(async () => {
        // Then, save all subtransactions rows for the subtransactions.
        for (let j = trans.length - 1; j >= 0; j--) {
          for (let k = trans[j].subTransactions.length - 1; k >= 0; k--) {
            await SubTransactionRow.save(trans[j].subTransactions[k].subTransactionRows);
          }
        }
      });

    transactions = transactions.concat(trans);

  }
  return {
    transactions,
    subTransactions: transactions.map((t) => t.subTransactions).flat(),
  };
}

/**
 * Create mock stripe deposits objects. Note that the stripe IDs are fake, so you cannot use
 * these entries to make actual API calls to Stripe.
 * @param users
 */
// TODO: Increase speed with correct awaits/then/Promise.all()
export async function seedStripeDeposits(users: User[]): Promise<{
  stripeDeposits: StripeDeposit[],
  stripeDepositTransfers: Transfer[],
}> {
  const stripeDeposits: StripeDeposit[] = [];
  const transfers: Transfer[] = [];

  const totalNrOfStatuses = 3;

  for (let i = 0; i < users.length * totalNrOfStatuses + 1; i += 1) {
    const to = users[Math.floor(i / 4)];
    const amount = DineroTransformer.Instance.from(3900);
    // eslint-disable-next-line no-await-in-loop
    const stripePaymentIntent = await StripePaymentIntent.save({
      stripeId: `FakeStripeIDDoNotUsePleaseThankYou_${i + 1}`,
      amount,
      paymentIntentStatuses: [],
    });
    // eslint-disable-next-line no-await-in-loop
    const newDeposit = await StripeDeposit.save({
      stripePaymentIntent,
      to,
    });

    const succeeded = Math.floor(((i % 8) + 1) / 4) !== 1;
    const states = [StripePaymentIntentState.CREATED, StripePaymentIntentState.PROCESSING,
      succeeded ? StripePaymentIntentState.SUCCEEDED : StripePaymentIntentState.FAILED].slice(0, i % 4);

    if (succeeded) {
      const transfer = Object.assign(new Transfer(), {
        from: null,
        to,
        amountInclVat:amount,
        description: `Deposit transfer for ${amount}`,
      });
      await transfer.save();
      newDeposit.transfer = transfer;
      await StripeDeposit.save(newDeposit);
      transfer.deposit = newDeposit;
      transfers.push(transfer);
    }

    const statePromises: Promise<any>[] = [];
    states.forEach((state) => {
      const newState = Object.assign(new StripePaymentIntentStatus(), {
        stripePaymentIntent,
        state,
      });
      statePromises.push(newState.save());
      stripePaymentIntent.paymentIntentStatuses.push(newState);
    });

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(statePromises);
    stripeDeposits.push(newDeposit);
  }

  return {
    stripeDeposits,
    stripeDepositTransfers: transfers,
  };
}

/**
 * Handout fines for all eligible users on the given reference date. Reuse the given user fine groups if
 * @param users
 * @param transactions
 * @param transfers
 * @param userFineGroups
 * @param firstReferenceDate
 */
export async function seedSingleFines(users: User[], transactions: Transaction[], transfers: Transfer[], userFineGroups: UserFineGroup[] = [], firstReferenceDate: Date = new Date()) {
  const subTransactions: SubTransaction[] = Array.prototype.concat(...transactions
    .map((t) => t.subTransactions));
  // Get all users that are in debt and should get fined
  const debtors = users.filter((u) =>
    calculateBalance(u, transactions, subTransactions, transfers, firstReferenceDate).amount.getAmount() < 500);

  // Create a map from users to userFineGroups and initialize it with the existing userFineGroups
  const userFineGroupMap = new Map<User, UserFineGroup>();
  userFineGroups.forEach((g) => userFineGroupMap.set(g.user, g));

  let i = 0;

  const fineHandoutEvent = Object.assign(new FineHandoutEvent(), {
    referenceDate: firstReferenceDate,
  } as FineHandoutEvent);
  await fineHandoutEvent.save();

  const fineTransfers: Transfer[] = [];
  const fines = await Promise.all(debtors.map(async (u) => {
    i++;
    if (i % 2 === 0) return;

    let userFineGroup = userFineGroupMap.get(u);
    if (userFineGroup === undefined) {
      userFineGroup = Object.assign(new UserFineGroup(), {
        user: u,
        userId: u.id,
      } as UserFineGroup);
      await userFineGroup.save();
      userFineGroupMap.set(u, userFineGroup);
    }

    // Fine everyone 5 euros
    const amountInclVat = dinero({ amount: 500 });
    const transfer = Object.assign(new Transfer(), {
      from: u,
      fromId: u.id,
      amountInclVat,
      description: 'Seeded fine',
    } as Transfer);
    const fine = await transfer.save().then(async (t) => {
      const f = Object.assign(new Fine(), {
        fineHandoutEvent,
        userFineGroup,
        transfer: t,
        amount: amountInclVat,
      } as Fine);
      return f.save();
    });
    transfer.fine = fine;
    fineTransfers.push(transfer);
    return fine;
  }));

  return {
    fines: fines.filter((f) => f !== undefined),
    fineTransfers,
    fineHandoutEvent,
    userFineGroups: Array.from(userFineGroupMap.values()),
  };
}

/**
 * Add two fineHandoutEvents to the database, one on 2021-01-01 and the other at the current time.
 * @param users
 * @param transactions
 * @param transfers
 * @param addCurrentFines
 */
export async function seedFines(users: User[], transactions: Transaction[], transfers: Transfer[], addCurrentFines = false) {
  // Make a copy of users, so we can update currentFines
  let newUsers = users;

  const {
    fines: fines1,
    fineTransfers: fineTransfers1,
    userFineGroups: userFineGroups1,
    fineHandoutEvent: fineHandoutEvent1,
  } = await seedSingleFines(users, transactions, transfers, [], new Date('2021-01-01'));

  const {
    fines: fines2,
    fineTransfers: fineTransfers2,
    userFineGroups: userFineGroups2,
    fineHandoutEvent: fineHandoutEvent2,
  } = await seedSingleFines(users, transactions, [...transfers, ...fineTransfers1], userFineGroups1);

  // Remove duplicates
  const userFineGroups = [...userFineGroups1, ...userFineGroups2]
    .filter((g, i, groups) => groups.findIndex((g2) => g2.id === g.id) === i);
  const fines = [...fines1, ...fines2];

  // Add also a reference to the fine in the UserFineGroup
  fines.forEach((f) => {
    const i = userFineGroups.findIndex((g) => g.id === f.userFineGroup.id);
    if (userFineGroups[i].fines === undefined) userFineGroups[i].fines = [];
    userFineGroups[i].fines.push(f);
  });

  if (addCurrentFines) {
    newUsers = await Promise.all(users.map(async (user) => {
      const userFineGroup = userFineGroups.find((g) => user.id === g.userId);
      if (userFineGroup) {
        user.currentFines = userFineGroup;
        await user.save();
      }
      return user;
    }));
  }

  return {
    fines,
    fineTransfers: [...fineTransfers1, ...fineTransfers2],
    userFineGroups,
    fineHandoutEvents: [fineHandoutEvent1, fineHandoutEvent2],
    users: newUsers,
  };
}

export async function seedPayoutRequests(users: User[]): Promise<{
  payoutRequests: PayoutRequest[], payoutRequestTransfers: Transfer[],
}> {
  const payoutRequests: Promise<PayoutRequest>[] = [];
  const transfers: Transfer[] = [];

  const admins = users.filter((u) => u.type === UserType.LOCAL_ADMIN);
  admins.push(undefined);

  const totalNrOfStatuses = 3;
  let finalState = 0;

  for (let i = 0; i < users.length * 3; i += 1) {
    const requestedBy = users[Math.floor(i / totalNrOfStatuses)];
    const amount = DineroTransformer.Instance.from(3900);
    const newPayoutReq = Object.assign(new PayoutRequest(), {
      requestedBy,
      amount,
      bankAccountNumber: 'NL69GEWI0420042069',
      bankAccountName: `${requestedBy.firstName} ${requestedBy.lastName}`,
    });

    const option = Math.floor(finalState % 3);
    let lastOption;
    switch (option) {
      case 0: lastOption = PayoutRequestState.APPROVED; break;
      case 1: lastOption = PayoutRequestState.DENIED; break;
      default: lastOption = PayoutRequestState.CANCELLED; break;
    }
    const states = [PayoutRequestState.CREATED, lastOption].slice(0, i % totalNrOfStatuses);
    if (states.length === 2) finalState += 1;

    const statusses: PayoutRequestStatus[] = [];
    states.forEach((state, index) => {
      statusses.push(Object.assign(new PayoutRequestStatus(), {
        state,
        createdAt: new Date((new Date()).getTime() + 1000 * 60 * index),
        updatedAt: new Date((new Date()).getTime() + 1000 * 60 * index),
      }));
      if (state === PayoutRequestState.APPROVED) {
        newPayoutReq.approvedBy = admins[i % admins.length];
      }
    });

    if (i % 5 === 0) {
      const transfer = Object.assign(new Transfer(), {
        from: requestedBy,
        to: null,
        amountInclVat: amount,
        description: `Payout request for ${amount}`,
      });
      await transfer.save();
      transfer.payoutRequest = newPayoutReq;
      transfers.push(transfer);
      newPayoutReq.transfer = transfer;
    }

    payoutRequests.push(newPayoutReq.save().then(async (payoutRequest) => {
      await Promise.all(statusses.map((s) => {
        // eslint-disable-next-line no-param-reassign
        s.payoutRequest = payoutRequest;
        return s.save();
      }));
      // eslint-disable-next-line no-param-reassign
      payoutRequest.payoutRequestStatus = statusses;
      return payoutRequest;
    }));
  }

  return {
    payoutRequests: await Promise.all(payoutRequests),
    payoutRequestTransfers: transfers,
  };
}

export async function seedTransfers(users: User[],
  startDate?: Date, endDate?: Date) : Promise<Transfer[]> {
  const transfers: Transfer[] = [];
  const promises: Promise<any>[] = [];

  for (let i = 0; i < users.length; i += 1) {
    let date = new Date();
    if (startDate && endDate) {
      date = getDate(startDate, endDate, i);
    }
    let newTransfer = Object.assign(new Transfer(), {
      description: '',
      amountInclVat: dinero({ amount: 100 * (i + 1) }),
      from: undefined,
      to: users[i],
      createdAt: date,
    });
    transfers.push(newTransfer);
    promises.push(Transfer.save(newTransfer));

    newTransfer = Object.assign(new Transfer(), {
      description: '',
      amountInclVat: dinero({ amount: 50 * (i + 1) }),
      from: users[i],
      to: undefined,
      createdAt: date,
    });
    transfers.push(newTransfer);
    promises.push(Transfer.save(newTransfer));
  }

  await Promise.all(promises);

  return transfers;
}

/**
 * Create a BannerImage object. When not in a testing environment, a banner image
 * will also be saved on disk.
 *
 * @param banner
 * @param createdBy
 */
function defineBannerImage(banner: Banner, createdBy: User): BannerImage {
  const downloadName = `banner-${banner.id}.png`;

  let location;
  if (process.env.NODE_ENV !== 'test') {
    const source = path.join(__dirname, './static/banner.png');
    location = path.join(__dirname, '../', BANNER_IMAGE_LOCATION, downloadName);
    fs.copyFileSync(source, location);
  } else {
    location = `fake/storage/${downloadName}`;
  }

  return Object.assign(new BannerImage(), {
    id: banner.id,
    location,
    downloadName,
    createdBy,
  });
}

export async function seedWriteOffs(count = 10): Promise<WriteOff[]> {
  const userCount = await User.count();
  const users = new UserSeeder().defineUsers(userCount, count, UserType.LOCAL_USER, false);
  await User.save(users);

  for (const u of users) {
    u.firstName = 'WriteOff';
    u.deleted = true;
    await generateBalance(-1000, u.id);
  }
  await User.save(users);

  const writeOffs: WriteOff[] = [];
  for (const u of users) {
    const writeOff = Object.assign(new WriteOff(), {
      to: u,
      amount: dinero({ amount: 1000 }),
    });
    await writeOff.save();
    writeOff.transfer = (await Transfer.save({
      amountInclVat: dinero({ amount: 1000 }),
      toId: u.id,
      description: 'WriteOff',
      fromId: null,
      writeOff,
    }));
    await writeOff.save();

    writeOffs.push(writeOff);
  }
  return writeOffs;
}

/**
 * Seeds a default dataset of banners based on the given users.
 * When not in a testing environment, actual images will also be saved to disk.
 * @param users
 */
export async function seedBanners(users: User[]): Promise<{
  banners: Banner[],
  bannerImages: BannerImage[],
}> {
  const banners: Banner[] = [];
  const bannerImages: BannerImage[] = [];

  const creators = users.filter((u) => [UserType.LOCAL_ADMIN].includes(u.type));

  for (let i = 0; i < creators.length * 4; i += 1) {
    const banner = Object.assign(new Banner(), {
      id: i + 1,
      name: `Banner-${i + 1}`,
      duration: Math.floor(Math.random() * (300 - 60) + 60),
      active: i % 2 === 0,
      startDate: new Date(),
      endDate: new Date(),
    });

    if (i % 4 !== 0) {
      banner.image = defineBannerImage(banner, creators[i % creators.length]);
      bannerImages.push(banner.image);
    }

    banners.push(banner);
  }

  await Promise.all(bannerImages.map((image) => BannerImage.save(image)));
  await Promise.all(banners.map((banner) => Banner.save(banner)));

  return { banners, bannerImages };
}

export interface DatabaseContent {
  users: User[],
  roles: Role[],
  roleAssignments: AssignedRole[],
  categories: ProductCategory[],
  vatGroups: VatGroup[],
  products: Product[],
  productRevisions: ProductRevision[],
  events: Event[],
  eventShifts: EventShift[],
  eventShiftAnswers: EventShiftAnswer[],
  containers: Container[],
  containerRevisions: ContainerRevision[],
  pointsOfSale: PointOfSale[],
  pointOfSaleRevisions: PointOfSaleRevision[],
  transactions: Transaction[],
  transfers: Transfer[],
  fines: Fine[],
  userFineGroups: UserFineGroup[],
  payoutRequests: PayoutRequest[],
  stripeDeposits: StripeDeposit[],
  invoices: Invoice[],
  banners: Banner[],
  gewisUsers: GewisUser[],
  pinUsers: PinAuthenticator[],
  localUsers: LocalAuthenticator[],
  writeOffs: WriteOff[],
}

export default async function seedDatabase(beginDate?: Date, endDate?: Date): Promise<DatabaseContent> {
  const users = await new UserSeeder().seedUsers();
  await new UserSeeder().seedMemberAuthenticators(
    users.filter((u) => u.type !== UserType.ORGAN),
    [users.filter((u) => u.type === UserType.ORGAN)[0]],
  );
  const pinUsers = await new UserSeeder().seedHashAuthenticator(users, PinAuthenticator);
  const localUsers = await new UserSeeder().seedHashAuthenticator(users, LocalAuthenticator);
  const gewisUsers = await seedGEWISUsers(users);
  const categories = await new ProductCategorySeeder().seedProductCategories();
  const vatGroups = await new VatGroupSeeder().seedVatGroups();
  const writeOffs = await seedWriteOffs();
  const {
    products, productRevisions,
  } = await new ProductSeeder().seedProducts(users, categories, vatGroups);
  const { containers, containerRevisions } = await new ContainerSeeder().seedContainers(
    users, productRevisions,
  );
  const { pointsOfSale, pointOfSaleRevisions } = await new PointOfSaleSeeder().seedPointsOfSale(
    users, containerRevisions,
  );
  const { roles, roleAssignments, events, eventShifts, eventShiftAnswers } = await seedEvents(users);
  const { transactions } = await seedTransactions(users, pointOfSaleRevisions, beginDate, endDate);
  const transfers = await seedTransfers(users, beginDate, endDate);
  const { fines, fineTransfers, userFineGroups } = await seedFines(users, transactions, transfers);
  const { payoutRequests, payoutRequestTransfers } = await seedPayoutRequests(users);
  const { invoices, invoiceTransfers } = await seedInvoices(users, transactions);
  const { stripeDeposits, stripeDepositTransfers } = await seedStripeDeposits(users);
  const { banners } = await seedBanners(users);

  return {
    users,
    roles,
    roleAssignments,
    categories,
    vatGroups,
    products,
    productRevisions,
    containers,
    containerRevisions,
    pointsOfSale,
    pointOfSaleRevisions,
    transactions,
    stripeDeposits,
    invoices,
    transfers: transfers.concat(fineTransfers).concat(payoutRequestTransfers).concat(invoiceTransfers).concat(stripeDepositTransfers),
    fines,
    userFineGroups,
    payoutRequests,
    banners,
    gewisUsers,
    pinUsers,
    localUsers,
    events,
    eventShifts,
    eventShiftAnswers,
    writeOffs,
  };
}
