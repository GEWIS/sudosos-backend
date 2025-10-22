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
 * This is the module page of the revision-to-response.
 *
 * @module helpers
 */

import ProductRevision from '../entity/product/product-revision';
import { BaseProductResponse } from '../controller/response/product-response';
import { BaseContainerResponse } from '../controller/response/container-response';
import ContainerRevision from '../entity/container/container-revision';
import { BasePointOfSaleResponse } from '../controller/response/point-of-sale-response';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import User, { TermsOfServiceStatus, UserType } from '../entity/user/user';
import { BaseUserResponse, InvoiceUserResponse, UserResponse } from '../controller/response/user-response';
import VatGroup from '../entity/vat-group';
import { BaseVatGroupResponse } from '../controller/response/vat-group-response';
import BaseFile from '../entity/file/base-file';
import { SimpleFileResponse } from '../controller/response/simple-file-response';
import InvoiceUser from '../entity/user/invoice-user';

export function parseProductToBaseResponse(
  product: ProductRevision, timestamps: boolean,
): BaseProductResponse {
  return {
    id: product.product.id,
    name: product.name,
    revision: product.revision,
    priceInclVat: product.priceInclVat.toObject(),
    createdAt: timestamps ? product.createdAt.toISOString() : undefined,
    updatedAt: timestamps ? product.updatedAt.toISOString() : undefined,
    vat: {
      id: product.vat.id,
      percentage: product.vat.percentage,
      hidden: product.vat.hidden,
    },
  } as BaseProductResponse;
}

export function parseContainerToBaseResponse(
  container: ContainerRevision, timestamps: boolean,
): BaseContainerResponse {
  return {
    id: container.container.id,
    name: container.name,
    revision: container.revision,
    createdAt: timestamps ? container.createdAt.toISOString() : undefined,
    updatedAt: timestamps ? container.updatedAt.toISOString() : undefined,
  } as BaseContainerResponse;
}

export function parsePOSToBasePOS(
  pos: PointOfSaleRevision, timestamps: boolean,
): BasePointOfSaleResponse {
  return {
    id: pos.pointOfSale.id,
    name: pos.name,
    revision: pos.revision,
    useAuthentication: pos.useAuthentication,
    createdAt: timestamps ? pos.createdAt.toISOString() : undefined,
    updatedAt: timestamps ? pos.updatedAt.toISOString() : undefined,
  } as BasePointOfSaleResponse;
}

/**
 * Parses a raw user DB object to BaseUserResponse
 * @param user - User to parse
 * @param timestamps - Boolean if createdAt and UpdatedAt should be included
 */
export function parseUserToBaseResponse(user: User, timestamps: boolean): BaseUserResponse {
  if (!user) return undefined;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    createdAt: timestamps ? user.createdAt.toISOString() : undefined,
    updatedAt: timestamps ? user.updatedAt.toISOString() : undefined,
  } as BaseUserResponse;
}

export function parseVatGroupToResponse(vatGroup: VatGroup): BaseVatGroupResponse {
  return {
    id: vatGroup.id,
    percentage: vatGroup.percentage,
    hidden: vatGroup.hidden,
  };
}

/**
 * Parses a User DB entity to a UserResponse
 * @param user - User to parse
 * @param timestamps - Boolean if createdAt and UpdatedAt should be included
 */
export function parseUserToResponse(user: User, timestamps = false): UserResponse {
  if (!user) return undefined;
  return {
    ...parseUserToBaseResponse(user, timestamps),
    active: user.active,
    deleted: user.deleted,
    type: UserType[user.type],
    acceptedToS: user.acceptedToS,
    email: user.type === UserType.LOCAL_USER ? user.email : undefined,
    extensiveDataProcessing: user.extensiveDataProcessing,
    ofAge: user.ofAge,
    canGoIntoDebt: user.canGoIntoDebt,
  };
}

export interface RawUser {
  createdAt: string,
  updatedAt: string,
  version: number,
  id: number,
  firstName: string,
  lastName: string,
  nickname: string,
  active: number,
  ofAge: number,
  email: string,
  deleted: number,
  type: string,
  acceptedToS: TermsOfServiceStatus,
  extensiveDataProcessing: number,
  canGoIntoDebt: number,
}

/**
 * Parses a raw User Entity to a UserResponse
 * @param user
 * @param timestamps
 */
export function parseRawUserToResponse(user: RawUser, timestamps = false): UserResponse {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    createdAt: timestamps ? user.createdAt : undefined,
    updatedAt: timestamps ? user.updatedAt : undefined,
    active: user.active === 1,
    deleted: user.deleted === 1,
    type: user.type,
    email: user.type === UserType.LOCAL_USER ? user.email : undefined,
    acceptedToS: user.acceptedToS,
    extensiveDataProcessing: user.extensiveDataProcessing === 1,
    ofAge: user.ofAge === 1,
    canGoIntoDebt: user.canGoIntoDebt === 1,
  };
}

export function parseFileToResponse<T extends BaseFile>(file: T): SimpleFileResponse {
  return {
    createdBy: parseUserToResponse(file.createdBy, false),
    downloadName: file.downloadName,
    id: file.id,
    location: file.location,
  };
}

export function parseInvoiceUserToResponse(invoiceUser: InvoiceUser): InvoiceUserResponse {
  return {
    automatic: invoiceUser.automatic,
    city: invoiceUser.city,
    country: invoiceUser.country,
    postalCode: invoiceUser.postalCode,
    street: invoiceUser.street,
    user: parseUserToBaseResponse(invoiceUser.user, false),
  };
}
