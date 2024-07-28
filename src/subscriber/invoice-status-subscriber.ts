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

import { EntityManager, EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import InvoiceStatus from '../entity/invoices/invoice-status';
import Invoice from '../entity/invoices/invoice';

@EventSubscriber()
export default class InvoiceStatusSubscriber implements EntitySubscriberInterface {
  listenTo(): Function | string {
    return InvoiceStatus;
  }

  async afterInsert(event: InsertEvent<InvoiceStatus>): Promise<void> {
    await InvoiceStatusSubscriber.updateInvoiceStatus(event.manager, event.entity.invoice.id, event.entity);
  }

  async afterUpdate(event: UpdateEvent<InvoiceStatus>): Promise<void> {
    await InvoiceStatusSubscriber.updateInvoiceStatus(event.manager, event.databaseEntity.invoice.id, event.databaseEntity);
  }

  static async updateInvoiceStatus(manager: EntityManager, invoiceId: number, status: InvoiceStatus): Promise<void> {
    const invoiceRepository = manager.getRepository(Invoice);
    const invoice = await invoiceRepository.findOne({ where: { id: invoiceId }, relations: ['latestStatus'] });

    if (invoice) {
      invoice.latestStatus = status;
      await invoiceRepository.save(invoice);
    }
  }
}
