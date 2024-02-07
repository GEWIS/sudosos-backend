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
import User from '../entity/user/user';
import { GdprResponse } from '../controller/response/gdpr-response';
import { parseUserToBaseResponse, parseUserToResponse } from '../helpers/revision-to-response';
import { BaseUserResponse } from '../controller/response/user-response';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';
import TransactionService from './transaction-service';
import { TransactionResponse } from '../controller/response/transaction-response';
import { TransferResponse } from '../controller/response/transfer-response';
import TransferService from './transfer-service';
import InvoiceService from './invoice-service';
import BannerImage from '../entity/file/banner-image';
import ProductImage from '../entity/file/product-image';
import ProductService from './product-service';
import ContainerService from './container-service';
import PointOfSaleService from './point-of-sale-service';
import { EventResponse } from '../controller/response/event-response';
import EventService from './event-service';

export default class GdprService {
  constructor(private user: User) {}

  private async getRoles(): Promise<string[]> {
    const userCopy = await User.findOne({ where: { id: this.user.id }, relations: { roles: true } });
    return userCopy.roles.map((r) => r.role);
  }

  private async getAssociatedUsers(): Promise<BaseUserResponse[]> {
    const memberAuthenticators = await MemberAuthenticator
      .find({ where: [{ userId: this.user.id }, { authenticateAsId: this.user.id }], relations: { user: true, authenticateAs: true } });

    const associatedUsers = memberAuthenticators.map((authenticator) => {
      if (authenticator.userId === this.user.id) return authenticator.authenticateAs;
      if (authenticator.authenticateAsId === this.user.id) return authenticator.user;
    });
    return associatedUsers.map((u) => parseUserToBaseResponse(u, false));
  }

  private async getTransactions(): Promise<TransactionResponse[]> {
    const { records: fromTransactions } = await TransactionService.getTransactions({ toId: this.user.id });
    const { records: toTransactions } = await TransactionService.getTransactions({ fromId: this.user.id });
    const { records: createdByTransactions } = await TransactionService.getTransactions({ createdById: this.user.id });

    const transactions = await Promise.all([...fromTransactions, ...toTransactions, ...createdByTransactions]
      .filter((t1, index, all) => index === all.findIndex((t2) => t1.id === t2.id))
      .map(async (t) => {
        const transaction = await TransactionService.getSingleTransaction(t.id);
        return transaction!;
      } ));

    return transactions.sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  private async getTransfers(): Promise<TransferResponse[]> {
    const { records: incomingTransfers } = await TransferService.getTransfers({ toId: this.user.id });
    const { records: outgoingTransfers } = await TransferService.getTransfers({ fromId: this.user.id });
    return [...incomingTransfers, ...outgoingTransfers].sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  private async getBannerImages(): Promise<string[]> {
    const banners = await BannerImage.find({ where: { createdBy: { id: this.user.id } } });
    return banners.map((b) => b.location);
  }

  private async getProductImages(): Promise<string[]> {
    const products = await ProductImage.find({ where: { createdBy: { id: this.user.id } } });
    return products.map((p) => p.location);
  }

  private async getEvents(): Promise<EventResponse[]> {
    // const events = await Event.find({
    //   where: { shifts: { answers: { userId: this.user.id } } },
    //   relations: { shifts: { answers: { user: true } } },
    // });
    //
    // return events.map((e) => EventService.asEventResponse(e));

    const { records: baseEvents } = await EventService.getEvents();
    const events = await Promise.all(baseEvents.map((e) => EventService.getSingleEvent(e.id)));

    // Only keep the events that have at least one answer from the given user
    const filteredEvents = events.filter((e) => e.shifts
      .some((s) => s.answers
        .some((a) => a.user.id === this.user.id)));

    return filteredEvents.map((event) => {
      const filteredShifts = event.shifts.filter((s) => s.answers.some((a) => a.user.id === this.user.id));
      const censoredShifts = filteredShifts.map((shift) => {
        const filteredAnswers = shift.answers.filter((a) => a.user.id === this.user.id);
        return {
          ...shift,
          answers: filteredAnswers,
        };
      });

      return {
        ...event,
        shifts: censoredShifts,
      };
    });
  }

  public async getGdprResponse(): Promise<GdprResponse> {
    const roles = await this.getRoles();
    const associatedUsers = await this.getAssociatedUsers();

    const transactions = await this.getTransactions();
    const transfers = await this.getTransfers();
    const { records: invoices } = await InvoiceService.getInvoices({ toId: this.user.id });

    const bannerImages = await this.getBannerImages();
    const productImages = await this.getProductImages();

    const { records: ownedProducts } = await ProductService.getProducts({ ownerId: this.user.id });
    const { records: ownedContainers } = await ContainerService.getContainers({ ownerId: this.user.id });
    const { records: ownedPointsOfSale } = await PointOfSaleService.getPointsOfSale({ ownerId: this.user.id });

    const events = await this.getEvents();

    return {
      ...parseUserToResponse(this.user, true),
      roles,
      associatedUsers,
      transactions,
      transfers,
      invoices,
      bannerImages,
      productImages,
      ownedProducts,
      ownedContainers,
      ownedPointsOfSale,
      events,
    };
  }
}