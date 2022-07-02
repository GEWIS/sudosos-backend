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

import { POSProductOrderingRequest } from '../controller/request/pos-product-ordering-request';
import { POSProductOrderingResponse } from '../controller/response/pos-product-ordering-response';
import ContainerRevision from '../entity/container/container-revision';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import ProductOrdering from '../entity/point-of-sale/product-ordering';

export default class POSProductOrderingService {
  /**
  * Verifies whether a point of sale ordering is valid
  * @param {POSProductOrderingRequest.model} req - the point of sale ordering request
  * @returns {boolean} - whether point of sale ordering is valid
  */
  public static async verifyOrdering(req: POSProductOrderingRequest): Promise<boolean> {
    // check empty fields
    if (!req.pointOfSaleId || !req.ordering) {
      return false;
    }

    // check for duplicates in ordering
    if (new Set(req.ordering).size !== req.ordering.length) {
      return false;
    }

    // check if point of sale exists in database
    const pointOfSale = await PointOfSale.findOne(req.pointOfSaleId);

    // point of sale not found
    if (!pointOfSale) {
      return false;
    }

    // get the point of sale revision to check products
    const posRevision = await PointOfSaleRevision.findOne({
      revision: pointOfSale.currentRevision,
      pointOfSale: { id: pointOfSale.id },
    }, { relations: ['pointOfSale', 'containers'] });

    // get individual container revisions
    const containers = await Promise.all(posRevision.containers.map(
      async (container) => {
        const revision = ContainerRevision.findOne({
          revision: container.revision,
          container: { id: container.container.id },
        }, { relations: ['container', 'products'] });

        return revision;
      },
    ));

    // store ids of the products in the point of sale
    const productIds: number[] = [];
    containers.forEach((container) => container.products.map(
      (product) => product.product.id,
    ).forEach((productId) => productIds.push(productId)));

    // check whether all products in the ordering exist in the point of sale
    if (!req.ordering.every((productId) => productIds.includes(productId))) {
      return false;
    }

    return true;
  }

  /**
  * Verifies whether the id of an update request matches the id of the updated ordering
  * @param {integer} id - the id of the point of sale
  * @param {POSProductOrderingRequest.model} req - the point of sale ordering request
  * @returns {boolean} - whether the update is valid
  */
  public static verifyUpdate(id: number, req: POSProductOrderingRequest): boolean {
    return id === req.pointOfSaleId;
  }

  /**
  * Creates an ordering from an ordering request
  * @param {POSProductOrderingRequest.model} ordering - the ordering request to cast
  * @returns {POSProductOrderingResponse.model} - the ordering
  */
  public static async asOrdering(req: POSProductOrderingRequest):
  Promise<ProductOrdering | undefined> {
    if (!req) {
      return undefined;
    }

    return {
      pointOfSale: await PointOfSale.findOne(req.pointOfSaleId),
      ordering: req.ordering,
    } as ProductOrdering;
  }

  /**
  * Creates an ordering response from an ordering
  * @param {ProductOrdering.model} ordering - the ordering to cast
  * @returns {POSProductOrderingResponse.model} - the ordering response
  */
  public static asOrderingResponse(ordering: ProductOrdering): POSProductOrderingResponse {
    if (!ordering) {
      return undefined;
    }

    return {
      pointOfSaleId: ordering.pointOfSale.id,
      ordering: ordering.ordering.map((productId) => +productId),
    } as POSProductOrderingResponse;
  }

  /**
  * Saves a product ordering for the requested point of sale, overwrites existing ordering
  * @param {POSProductOrderingRequest.model} req - the requested ordering
  * @returns {POSProductOrderingResponse.model} - the saved ordering
  */
  public static async createPOSProductOrdering(req: POSProductOrderingRequest):
  Promise<POSProductOrderingResponse | undefined> {
    return this.asOrderingResponse(await ProductOrdering.save(await this.asOrdering(req)));
  }

  /**
  * Gets a product ordering for the requested point of sale
  * @param {integer} id - the id of the requested point of sale product ordering
  * @returns {POSProductOrderingResponse.model} - the requested point of sale product ordering
  */
  public static async getPOSProductOrdering(id: number):
  Promise<POSProductOrderingResponse | undefined> {
    return this.asOrderingResponse(await ProductOrdering.findOne({
      where: { pointOfSale: id },
      relations: ['pointOfSale'],
    }));
  }

  /**
  * Deletes a product ordering
  * @param {integer} id - the id of the requested transaction
  * @returns {POSProductOrderingResponse.model} - the deleted product ordering
  */
  public static async deletePOSProductOrdering(id: number):
  Promise<POSProductOrderingResponse | undefined> {
    // get the product ordering we should delete
    const ordering = await this.getPOSProductOrdering(id);

    // delete the product ordering
    await ProductOrdering.delete(await this.asOrdering(ordering));

    // return the deleted product ordering
    return ordering;
  }
}
