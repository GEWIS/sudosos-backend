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
import {expect} from 'chai';
import {ProductResponse} from '../../src/controller/response/product-response';
import {DineroObjectRequest} from '../../src/controller/request/dinero-request';
import RevisionRequest from '../../src/controller/request/revision-request';
import {ContainerWithProductsResponse} from '../../src/controller/response/container-response';
import {
  SubTransactionRequest,
  SubTransactionRowRequest,
  TransactionRequest,
} from '../../src/controller/request/transaction-request';
import {PointOfSaleWithContainersResponse} from '../../src/controller/response/point-of-sale-response';
import PointOfSaleRevision from '../../src/entity/point-of-sale/point-of-sale-revision';
import PointOfSaleService from '../../src/service/point-of-sale-service';
import TransactionService from "../../src/service/transaction-service";
import Transaction from '../../src/entity/transactions/transaction';
import {In, UpdateResult} from "typeorm";
import {AppDataSource} from "../../src/database/database";
import {toMySQLString} from "../../src/helpers/timestamps";

function wrapGet<T>(array: T[], index: number): T {
  return array[index % array.length];
}

function createValidSubTransactionRowRequest(
  amount: number, productRevision: ProductResponse,
): SubTransactionRowRequest {
  return {
    amount,
    totalPriceInclVat: {
      amount: productRevision.priceInclVat.amount * amount,
      currency: productRevision.priceInclVat.currency,
      precision: productRevision.priceInclVat.precision,
    } as DineroObjectRequest,
    product: {
      id: productRevision.id,
      revision: productRevision.revision,
    } as RevisionRequest,
  };
}

function createValidSubTransactionRequest(
  containerRevision: ContainerWithProductsResponse, rowAmount: number, toId: number,
): SubTransactionRequest {
  const subTransactionRowRequest: SubTransactionRowRequest[] = [];
  let price = 0;
  for (let i = 0; i < rowAmount; i += 1) {
    const t = createValidSubTransactionRowRequest(i + 1, wrapGet(containerRevision.products, i));
    subTransactionRowRequest.push(t);
    price += t.totalPriceInclVat.amount;
  }
  return {
    to: toId,
    container: {
      id: containerRevision.id,
      revision: containerRevision.revision,
    },
    subTransactionRows: subTransactionRowRequest,
    totalPriceInclVat: {
      amount: price,
      currency: dinero.defaultCurrency,
      precision: dinero.defaultPrecision,
    },
  } as SubTransactionRequest;
}

export async function getAPOSWithProducts(index? : number):
Promise<PointOfSaleWithContainersResponse> {
  const posList = (await PointOfSaleRevision.find({ relations: ['pointOfSale', 'containers', 'containers.container'] })).filter((p) => p.containers.length > 0);
  const pointOfSale = wrapGet(posList, index ?? 0);
  return (await PointOfSaleService.getPointsOfSale(
    {
      pointOfSaleId: pointOfSale.pointOfSale.id,
      pointOfSaleRevision: pointOfSale.revision,
      returnContainers: true,
      returnProducts: true,
    },
  )).records[0] as PointOfSaleWithContainersResponse;
}

/**
 * Function that generates a valid Transaction.
 * @param byId - User who created the Transaction.
 * @param pointOfSale - Point of sale that was used.
 * @param rowAmount - Amount of SubTrans. rows.
 */
export async function createValidTransactionRequestPOS(
  byId: number, toId: number, rowAmount: number, pointOfSale: PointOfSaleWithContainersResponse,
): Promise<TransactionRequest> {
  const containerRevision = pointOfSale.containers[0];

  expect(containerRevision.products).to.not.be.empty;
  expect(containerRevision).to.not.be.undefined;

  const subTransactionRequest: SubTransactionRequest = (
    createValidSubTransactionRequest(containerRevision, rowAmount, toId));

  return {
    createdBy: byId,
    from: byId,
    pointOfSale: {
      id: pointOfSale.id,
      revision: pointOfSale.revision,
    } as RevisionRequest,
    totalPriceInclVat: subTransactionRequest.totalPriceInclVat,
    subTransactions: [subTransactionRequest],
  };
}

export async function createValidTransactionRequest(byId: number, toId: number) {
  const pos = await getAPOSWithProducts();
  const request = (await createValidTransactionRequestPOS(
    byId, toId, 3, pos,
  ));
  return request;
}

export async function createTransactionRequest(debtorId: number,
  creditorId: number, transactionCount: number) {
  const transactions: TransactionRequest[] = [];
  await Promise.all(Array(transactionCount).fill(0, 0).map(async () => {
    const t = await createValidTransactionRequest(
      debtorId, creditorId,
    );
    return transactions.push(t as TransactionRequest);
  }));
  return transactions;
}

export async function requestToTransaction(
  transactionRequests: TransactionRequest[],
) {
  const transactions: Array<{ tId: number; amount: number }> = [];
  let total = 0;
  await Promise.all(
    transactionRequests.map(async (t) => {
      const transactionResponse = await new TransactionService().createTransaction(t);
      transactions.push({
        tId: transactionResponse.id,
        amount: transactionResponse.totalPriceInclVat.amount,
      });
      total += transactionResponse.totalPriceInclVat.amount;
    }),
  );
  return { transactions, total };
}

export async function createTransactions(debtorId: number, creditorId: number, transactionCount: number, delta?: number) {
  const requests: TransactionRequest[] = await createTransactionRequest(
    debtorId, creditorId, transactionCount,
  );

  const transactions = await requestToTransaction(requests);
  if (delta) {
    const promises: Promise<any>[] = [];
    const ids = transactions.transactions.map((t) => t.tId);
    await Transaction.find({ where: { id: In(ids) }, relations: ['subTransactions', 'subTransactions.subTransactionRows'] }).then((tr) => {
      tr.forEach((t) => {
        let createdAt = new Date(t.createdAt.getTime() + delta);
        let query = `UPDATE \`transaction\` SET createdAt = '${toMySQLString(createdAt)}' WHERE id = ${t.id}`;
        promises.push(AppDataSource.query(query));
        t.subTransactions.forEach((st) => {
          createdAt = new Date(st.createdAt.getTime() + delta);
          query = `UPDATE \`sub_transaction\` SET createdAt = '${toMySQLString(createdAt)}' WHERE id = ${st.id}`;
          promises.push(AppDataSource.query(query));
          st.subTransactionRows.forEach((sr) => {
            createdAt = new Date(sr.createdAt.getTime() + delta);
            query = `UPDATE \`sub_transaction_row\` SET createdAt = '${toMySQLString(createdAt)}' WHERE id = ${sr.id}`;
            promises.push(AppDataSource.query(query));
          });
        });
      });
    });
    await Promise.all(promises);
  }


  return transactions;
}
