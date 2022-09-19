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
import SubTransactionRow from '../entity/transactions/sub-transaction-row';
import Transaction from '../entity/transactions/transaction';
import {
  TransactionReportCategoryEntry,
  TransactionReportEntry, TransactionReportVatEntry,
} from '../controller/response/transaction-report-response';
import Dinero from 'dinero.js';
import InvoiceEntry from '../entity/invoices/invoice-entry';
import Invoice from '../entity/invoices/invoice';
import SubTransaction from '../entity/transactions/sub-transaction';

/**
 * Applies a function to all SubTransactionRows of the given transactions.
 * @param transactions
 * @param callbackfn
 */
export function transactionMapper(transactions: Transaction[], callbackfn: (subTransactionRow: SubTransactionRow) => any) {
  transactions.forEach((t) => {
    t.subTransactions.forEach((tSub) => {
      tSub.subTransactionRows.forEach(callbackfn);
    });
  });
}

/**
 * Function that collects items based on a given getKey function
 * @param map
 * @param item
 * @param getKey
 */
export function collectByKey<T>(map: Map<string | number, T[]>, item: T, getKey: (item: T) => string | number) {
  const key = getKey(item);
  if (map.has(key)) {
    map.get(key).push(item);
  } else {
    map.set(key, [item]);
  }
}

/**
 * Function that collects transactions by products based on their revision
 * @param productMap
 * @param tSubRow
 */
export function collectProductsByRevision(productMap: Map<string, SubTransactionRow[]>, tSubRow: SubTransactionRow) {
  const getKey = (item: SubTransactionRow) => JSON.stringify({
    revision: item.product.revision,
    id: item.product.product.id,
  });
  collectByKey<SubTransactionRow>(productMap, tSubRow, getKey);
}

/**
 * Function that collects transactions by product based on their category id
 * @param categoryMap
 * @param tSubRow
 */
export function collectProductsByCategory(categoryMap: Map<number, SubTransactionRow[]>, tSubRow: SubTransactionRow) {
  const getKey = (item: SubTransactionRow) => item.product.category.id;
  collectByKey<SubTransactionRow>(categoryMap, tSubRow, getKey);
}

/**
 * Function that collects transactions by product based on their Vat group
 * @param vatMap
 * @param tSubRow
 */
export function collectProductsByVat(vatMap: Map<number, SubTransactionRow[]>, tSubRow: SubTransactionRow) {
  const getKey = (item: SubTransactionRow) => item.product.vat.id;
  collectByKey<SubTransactionRow>(vatMap, tSubRow, getKey);
}

/**
 * Function that collects transaction by user ToId
 * @param toIdMap
 * @param tSub
 */
export function collectByToId(toIdMap: Map<number, SubTransaction[]>, tSub: SubTransaction) {
  const getKey = (item: SubTransaction) => item.to.id;
  collectByKey<SubTransaction>(toIdMap, tSub, getKey);
}

/**
 * Transforms an array of SubTransactionRows of a single product to TransactionReportEntries
 * @param productMap
 */
export function reduceMapToReportEntries(productMap: Map<string, SubTransactionRow[]>): TransactionReportEntry[] {
  const transactionReportEntries: TransactionReportEntry[] = [];
  productMap.forEach((value) => {
    const count = value.reduce((sum, current) => {
      return sum + current.amount;
    }, 0);
    const entry: TransactionReportEntry = {
      count,
      product: value[0].product,
    };
    transactionReportEntries.push(entry);
  });
  return transactionReportEntries;
}

/**
 * Extracts the total including and excluding vat from the given transactions
 * @param subTransactionRows
 */
function extractVatInfoTransactions(subTransactionRows: SubTransactionRow[]) {
  let totalInclVat = 0;
  let totalExclVat = 0;
  subTransactionRows.forEach((row) => {
    const amountInclVat = row.product.priceInclVat.getAmount() * row.amount;
    totalInclVat += amountInclVat;
    const amountExclVat: number = amountInclVat / (1 + (row.product.vat.percentage / 100));
    totalExclVat += amountExclVat;
  });
  return {
    totalInclVat,
    totalExclVat,
  };
}

/**
 * Transforms an array of SubTransactionRows with the same VAT group into TransactionReportVatEntries
 * @param vatMap
 */
export function reduceMapToVatEntries(vatMap: Map<number, SubTransactionRow[]>): TransactionReportVatEntry[] {
  const transactionReportEntries: TransactionReportVatEntry[] = [];
  vatMap.forEach((value) => {
    const info = extractVatInfoTransactions(value);
    const totalInclVat = info.totalInclVat;
    const totalExclVat = info.totalExclVat;
    const entry: TransactionReportVatEntry = {
      vat: value[0].product.vat,
      totalExclVat,
      totalInclVat: Dinero({ amount: totalInclVat }),
    };
    transactionReportEntries.push(entry);
  });
  return transactionReportEntries;
}

/**
 * Transforms an array of SubTransactionRows with the same product category into TransactionReportCategoryEntries
 * @param categoryMap
 */
export function reduceMapToCategoryEntries(categoryMap: Map<number, SubTransactionRow[]>): TransactionReportCategoryEntry[] {
  const transactionReportEntries: TransactionReportCategoryEntry[] = [];
  categoryMap.forEach((value) => {
    const info = extractVatInfoTransactions(value);
    const totalInclVat = info.totalInclVat;
    const totalExclVat = info.totalExclVat;
    const entry: TransactionReportCategoryEntry = {
      category: value[0].product.category,
      totalExclVat,
      totalInclVat: Dinero({ amount: totalInclVat }),
    };
    transactionReportEntries.push(entry);
  });
  return transactionReportEntries;
}

/**
 * Transforms an array of SubTransactionRows of the same product into invoice entries.
 * @param productMap
 * @param invoice
 */
export async function reduceMapToInvoiceEntries(productMap: Map<string, SubTransactionRow[]>, invoice: Invoice): Promise<InvoiceEntry[]> {
  const invoiceEntries: InvoiceEntry[] = [];
  const promises: Promise<any>[] = [];
  productMap.forEach((tSubRow) => {
    const product = tSubRow[0].product;
    const count = tSubRow.reduce((sum, current) => {
      return sum + current.amount;
    }, 0);
    const entry = Object.assign(new InvoiceEntry(), {
      invoice,
      description: product.name,
      amount: count,
      priceInclVat: product.priceInclVat,
      vatPercentage: product.vat.percentage,
    });
    promises.push(InvoiceEntry.save(entry).then((i) => invoiceEntries.push(i)));
  });
  await Promise.all(promises);
  return invoiceEntries;
}
