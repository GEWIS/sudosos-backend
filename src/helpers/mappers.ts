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
import { createQueryBuilder } from 'typeorm';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import User from '../entity/user/user';
import UpdatedProduct from '../entity/product/updated-product';
import { ProductResponse } from '../controller/response/product-response';
import { BaseTransactionResponse } from '../controller/response/transaction-response';
import Transaction from '../entity/transactions/transaction';
import SubTransaction from '../entity/transactions/sub-transaction';
import { RequestWithToken } from '../middleware/token-middleware';
import { addPaginationToQueryBuilder } from './pagination';
import DineroTransformer from '../entity/transformer/dinero-transformer';


export async function getProducts(owner: User = null, returnUpdated: boolean = true)
  : Promise<ProductResponse[]> {
  const builder = createQueryBuilder()
    .from(Product, 'product')
    .innerJoinAndSelect(ProductRevision, 'productrevision',
      'product.id = productrevision.product '
        + 'AND product.currentRevision = productrevision.revision')
    .select([
      'product.id', 'product.createdAt', 'productrevision.updatedAt',
      'productrevision.revision', 'productrevision.name', 'productrevision.price',
      'product.owner', 'productrevision.category', 'productrevision.picture',
      'productrevision.alcoholpercentage',
    ]);
  if (owner !== null) {
    builder.where('product.owner = :owner', { owner: owner.id });
  }
  if (!returnUpdated) {
    builder.where((qb) => {
      const subQuery = qb.subQuery()
        .select('updatedproduct.product')
        .from(UpdatedProduct, 'updatedproduct')
        .getQuery();
      return `product.id NOT IN (${subQuery})`;
    });
  }
  return await builder.getRawMany() as ProductResponse[];
}

export async function getUpdatedProducts(owner: User = null): Promise<ProductResponse[]> {
  const builder = createQueryBuilder(Product)
    .innerJoin(UpdatedProduct, 'updatedproduct',
      'product.id = updatedproduct.product')
    .select([
      'product.id', 'product.createdAt', 'updatedproduct.updatedAt', 'updatedproduct.name',
      'updatedproduct.price', 'product.owner', 'updatedproduct.category',
      'updatedproduct.picture', 'updatedproduct.alcoholpercentage',
    ]);
  if (owner !== null) {
    builder.where('product.owner = :owner', { owner: owner.id });
  }
  return await builder.getRawMany() as ProductResponse[];
}

export async function getProductsWithUpdates(owner: User = null): Promise<ProductResponse[]> {
  const products = await this.getProducts(owner);
  const updatedProducts = await this.getUpdatedProducts(owner);

  return products.concat(updatedProducts) as ProductResponse[];
}

export async function getTransactions(req: RequestWithToken): Promise<BaseTransactionResponse[]> {
  let query = createQueryBuilder(Transaction, 'transaction')
    .addSelect((qb) => qb.subQuery()
      .select('sum(subTransactionRow.amount * product.price) as value')
      .from(SubTransaction, 'subTransaction')
      .leftJoin('subTransaction.subTransactionRows', 'subTransactionRow')
      .innerJoin('subTransactionRow.product', 'product')
      .where('subTransaction.transactionId = transaction.id'), 'value')
    .leftJoinAndSelect('transaction.from', 'from')
    .leftJoinAndSelect('transaction.createdBy', 'createdBy')
    .leftJoinAndSelect('transaction.pointOfSale', 'pointOfSaleRev')
    .leftJoinAndSelect('pointOfSaleRev.pointOfSale', 'pointOfSale');

  query = addPaginationToQueryBuilder(req, query);

  const rawTransactions = await query.getRawMany();
  // return query.getRawMany();

  return rawTransactions.map((o) => {
    const v: BaseTransactionResponse = {
      id: o.transaction_id,
      createdAt: o.transaction_createdAt,
      updatedAt: o.transaction_updatedAt,
      from: {
        id: o.from_id,
        createdAt: o.from_createdAt,
        updatedAt: o.from_updatedAt,
        firstName: o.from_firstName,
        lastName: o.from_lastName,
        active: o.from_active,
        deleted: o.from_deleted,
        type: o.from_type,
      },
      createdBy: o.createdBy_id ? {
        id: o.createdBy_id,
        createdAt: o.createdBy_createdAt,
        updatedAt: o.createdBy_updatedAt,
        firstName: o.createdBy_firstName,
        lastName: o.createdBy_lastName,
        active: o.createdBy_active,
        deleted: o.createdBy_deleted,
        type: o.createdBy_type,
      } : undefined,
      pointOfSale: {
        id: o.pointOfSale_id,
        createdAt: o.pointOfSale_createdAt,
        updatedAt: o.pointOfSaleRev_updatedAt,
        name: o.pointOfSaleRev_name,
        revision: o.pointOfSale_revision,
        owner: undefined,
        startDate: o.pointOfSaleRev_startDate,
        endDate: o.pointOfSaleRev_endDate,
        products: undefined,
        useAuthentication: o.pointOfSaleRev_useAuthentication,
      },
      value: DineroTransformer.Instance.from(o.value || 0),
    };
    return v;
  });

  // const transactions = await getRepository(Transaction).find({
  //   relations: [
  //     'from', 'createdBy', 'pointOfSale',
  //     'subTransactions', 'subTransactions.to', 'subTransactions.container',
  //     'subTransactions.subTransactionRows', 'subTransactions.subTransactionRows.product',
  //   ],
  //   // select: [
  //   //   'id', 'createdAt', 'updatedAt', 'createdBy', 'from', 'pointOfSale',
  //   //   'transaction.subTransactions.id', 'subTransactions.createdAt', 'subTransactions.updatedAt', 'subTransactions.container',
  //   //   // 'subTransactions.subTransactionRows.id', 'subTransactions.subTransactionRows.createdAt', 'subTransactions.subTransactionRows.updatedAt', 'subTransactions.subTransactionRows.product', 'subTransactions.subTransactionRows.amount',
  //   // ],
  //   ...addPaginationForFindOptions(req) as any,
  // });
}
