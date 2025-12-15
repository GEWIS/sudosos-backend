/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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


import { expect } from 'chai';
import sinon, { SinonStub } from 'sinon';
import { DataSource } from 'typeorm';
import Database from '../../../src/database/database';
import Transaction from '../../../src/entity/transactions/transaction';
import TransactionPdfService from '../../../src/service/pdf/transaction-pdf-service';
import { finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import { ContainerSeeder, PointOfSaleSeeder, ProductSeeder, TransactionSeeder, UserSeeder } from '../../seed';
import { PdfError } from '../../../src/errors';

describe('TransactionPdfService', () => {
  let connection: DataSource;
  let service: TransactionPdfService;
  let compileHtmlStub: SinonStub;
  let transaction: Transaction;

  before(async () => {
    connection = await Database.initialize();
    await truncateAllTables(connection);
    
    const users = await new UserSeeder().seed();
    const { productRevisions } = await new ProductSeeder().seed(users);
    const { containerRevisions } = await new ContainerSeeder().seed(users, productRevisions);
    const { pointOfSaleRevisions } = await new PointOfSaleSeeder().seed(users, containerRevisions);
    const { transactions } = await new TransactionSeeder().seed(users, pointOfSaleRevisions);
    
    service = new TransactionPdfService(connection.manager);
    transaction = transactions[0];
  });

  after(async () => {
    await finishTestDB(connection);
  });

  beforeEach(() => {
    compileHtmlStub = sinon.stub(service, 'compileHtml' as any).resolves(Buffer.from('PDF content'));
  });

  afterEach(() => {
    if (compileHtmlStub) {
      compileHtmlStub.restore();
    }
  });

  describe('getParameters', () => {
    it('should return correct parameters for transaction', async () => {
      const params = await service.getParameters(transaction);

      expect(params.transactionId).to.equal(transaction.id.toString());
      expect(params.fromUserFirstName).to.equal(transaction.from.firstName);
      expect(params.fromUserLastName).to.equal(transaction.from.lastName);
      expect(params.fromId).to.equal(transaction.from.id.toString());
      expect(params.createdByUserFirstName).to.equal(transaction.createdBy.firstName);
      expect(params.createdByUserLastName).to.equal(transaction.createdBy.lastName);
      expect(params.items).to.be.an('array');
      expect(params.serviceEmail).to.be.a('string');
    });

    it('should throw error if transaction not found', async () => {
      const nonExistentTransaction = Object.assign(new Transaction(), { id: 99999 });

      await expect(service.getParameters(nonExistentTransaction)).to.be.rejectedWith(
        PdfError,
        'Transaction not found',
      );
    });

    it('should throw error if transaction missing from relation', async () => {
      // Create a transaction entity without from relation loaded
      const transactionWithoutFrom = Object.assign(new Transaction(), { id: transaction.id });
      
      // The service will fetch the transaction, but we can test by stubbing findOne on EntityManager
      const findOneStub = sinon.stub(connection.manager, 'findOne').resolves({
        ...transaction,
        from: null,
      } as Transaction);

      await expect(service.getParameters(transactionWithoutFrom)).to.be.rejectedWith(
        PdfError,
        'Transaction missing required relations',
      );

      findOneStub.restore();
    });

    it('should throw error if transaction missing createdBy relation', async () => {
      // Create a transaction entity without createdBy relation loaded
      const transactionWithoutCreatedBy = Object.assign(new Transaction(), { id: transaction.id });
      
      // The service will fetch the transaction, but we can test by stubbing findOne on EntityManager
      const findOneStub = sinon.stub(connection.manager, 'findOne').resolves({
        ...transaction,
        createdBy: null,
      } as Transaction);

      await expect(service.getParameters(transactionWithoutCreatedBy)).to.be.rejectedWith(
        PdfError,
        'Transaction missing required relations',
      );

      findOneStub.restore();
    });
  });

  describe('createPdfBuffer', () => {
    it('should create PDF buffer for transaction', async () => {
      const pdfBuffer = await service.createPdfBuffer(transaction);

      expect(pdfBuffer).to.be.instanceOf(Buffer);
      expect(compileHtmlStub).to.have.been.calledOnce;
    });
  });
});

