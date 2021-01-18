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
import {createQueryBuilder} from 'typeorm';
import Product from "../entity/product/product";
import ProductRevision from "../entity/product/product-revision";
import User from "../entity/user/user";
import UpdatedProduct from "../entity/product/updated-product";
import ProductResponse from "../controller/response/product-response";
import Container from "../entity/container/container";
import ContainerRevision from "../entity/container/container-revision";

export default class Mappers {
    public async getProducts(owner: User = null, returnUpdated: boolean = true): Promise<ProductResponse[]> {
        const builder = createQueryBuilder(Product, "product")
        .innerJoinAndSelect(ProductRevision, "productrevision", "product.id = productrevision.product " +
            "AND product.currentRevision = productrevision.revision")
        .select([
            'product.id', 'product.createdAt', 'productrevision.updatedAt', 'productrevision.revision',
            'productrevision.name', 'productrevision.price', 'product.owner', 'productrevision.category',
            'productrevision.picture', 'productrevision.alcoholpercentage'
        ]);
        if (owner !== null) {
            builder.where("product.owner = :owner", {owner: owner.id});
        }
        if (!returnUpdated) {
            builder.where(builder => {
                const subQuery = builder.subQuery()
                    .select("updatedproduct.product")
                    .from(UpdatedProduct, "updatedproduct")
                    .getQuery();
                return `product.id NOT IN (:subQuery)`, {subQuery: subQuery};
            });
        }
        return await builder.getMany() as ProductResponse[];
    }

    public async getUpdatedProducts(owner: User = null): Promise<ProductResponse[]> {
        const builder= createQueryBuilder(Product)
            .innerJoin(UpdatedProduct, "updatedproduct", "product.id = updatedproduct.product")
            .select([
                'product.id', 'product.createdAt', 'updatedproduct.updatedAt', 'updatedproduct.name',
                'updatedproduct.price', 'product.owner', 'updatedproduct.category', 'updatedproduct.picture',
                'updatedproduct.alcoholpercentage'
            ]);
        if (owner !== null) {
            builder.where("product.owner = :owner", {owner: owner.id});
        }
        return await builder.getMany() as ProductResponse[];
    }

    public async getProductsWithUpdates(owner: User = null): Promise<ProductResponse[]> {
        const products = await this.getProducts(owner);
        const updatedProducts = await this.getUpdatedProducts(owner);

        return products.concat(updatedProducts) as ProductResponse[];
    }


    public async getContainers(owner: User = null, returnUpdated: boolean = true): Promise<ProductResponse[]> {
        const builder = createQueryBuilder(Container, "container")
            .innerJoinAndSelect(ContainerRevision, "containerrevision", "container.id = containerrevision.product " +
                "AND container.currentRevision = containerrevision.revision")
            .select([
                'container.id', 'container.createdAt', 'containerrevision.updatedAt', 'containerrevision.revision',
                'containerrevision.name', 'containerrevision.price', 'container.owner', 'containerrevision.category',
                'containerrevision.picture', 'containerrevision.alcoholpercentage'
            ]);
        if (owner !== null) {
            builder.where("product.owner = :owner", {owner: owner.id});
        }
        if (!returnUpdated) {
            builder.where(builder => {
                const subQuery = builder.subQuery()
                    .select("updatedproduct.product")
                    .from(UpdatedProduct, "updatedproduct")
                    .getQuery();
                return `product.id NOT IN (:subQuery)`, {subQuery: subQuery};
            });
        }
        return await builder.getMany() as ProductResponse[];
    }

    public async getUpdatedProducts(owner: User = null): Promise<ProductResponse[]> {
        const builder= createQueryBuilder(Product)
            .innerJoin(UpdatedProduct, "updatedproduct", "product.id = updatedproduct.product")
            .select([
                'product.id', 'product.createdAt', 'updatedproduct.updatedAt', 'updatedproduct.name',
                'updatedproduct.price', 'product.owner', 'updatedproduct.category', 'updatedproduct.picture',
                'updatedproduct.alcoholpercentage'
            ]);
        if (owner !== null) {
            builder.where("product.owner = :owner", {owner: owner.id});
        }
        return await builder.getMany() as ProductResponse[];
    }

    public async getProductsWithUpdates(owner: User = null): Promise<ProductResponse[]> {
        const products = await this.getProducts(owner);
        const updatedProducts = await this.getUpdatedProducts(owner);

        return products.concat(updatedProducts) as ProductResponse[];
    }
}
