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
import dinero from 'dinero.js';
import { expect } from 'chai';
import { ProductResponse } from '../../src/controller/response/product-response';
import { DineroObjectRequest } from '../../src/controller/request/dinero-request';
import RevisionRequest from '../../src/controller/request/revision-request';
import { ContainerWithProductsResponse } from '../../src/controller/response/container-response';
import {
  SubTransactionRequest,
  SubTransactionRowRequest,
  TransactionRequest,
} from '../../src/controller/request/transaction-request';
import { PointOfSaleWithContainersResponse } from '../../src/controller/response/point-of-sale-response';
import PointOfSaleRevision from '../../src/entity/point-of-sale/point-of-sale-revision';
import PointOfSaleService from '../../src/service/point-of-sale-service';

function wrapGet<T>(array: T[], index: number): T {
  return array[index % array.length];
}

function createValidSubTransactionRowRequest(amount: number, productRevision: ProductResponse) {
  return {
    amount,
    price: {
      amount: productRevision.price.amount * amount,
      currency: productRevision.price.currency,
      precision: productRevision.price.precision,
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
    price += t.price.amount;
  }
  return {
    to: toId,
    container: {
      id: containerRevision.id,
      revision: containerRevision.revision,
    },
    subTransactionRows: subTransactionRowRequest,
    price: {
      amount: price,
      currency: dinero.defaultCurrency,
      precision: dinero.defaultPrecision,
    },
  } as SubTransactionRequest;
}

export async function getAPOSWithProducts(index? : number):
Promise<PointOfSaleWithContainersResponse> {
  const posList = (await PointOfSaleRevision.find({ relations: ['pointOfSale', 'containers', 'containers.container'] }));
  const pointOfSaleId = wrapGet(posList, index ?? 0).pointOfSale.id;
  return (await PointOfSaleService.getPointsOfSale(
    { pointOfSaleId, returnContainers: true },
  )).records[0] as PointOfSaleWithContainersResponse;
}

/**
 * Function that generates a valid Transaction.
 * @param byId - User who created the Transaction.
 * @param pointOfSale - Point of sale that was used.
 * @param rowAmount - Amount of SubTrans. rows.
 */
export default async function createValidTransactionRequestPOS(
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
    price: subTransactionRequest.price,
    subTransactions: [subTransactionRequest],
  };
}

export async function createValidTransactionRequest(byId: number, toId: number) {
  const pos = await getAPOSWithProducts();
  return (createValidTransactionRequestPOS(
    byId, toId, 3, pos,
  ));
}
