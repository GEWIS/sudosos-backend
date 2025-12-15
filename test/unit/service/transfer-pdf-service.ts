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
import Transfer from '../../../src/entity/transactions/transfer';
import User from '../../../src/entity/user/user';
import TransferPdfService from '../../../src/service/pdf/transfer-pdf-service';
import DineroTransformer from '../../../src/entity/transformer/dinero-transformer';
import { finishTestDB } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import { UserSeeder } from '../../seed';
import Invoice from '../../../src/entity/invoices/invoice';
import WriteOff from '../../../src/entity/transactions/write-off';
import StripeDeposit from '../../../src/entity/stripe/stripe-deposit';
import StripePaymentIntent from '../../../src/entity/stripe/stripe-payment-intent';
import PayoutRequest from '../../../src/entity/transactions/payout/payout-request';
import Fine from '../../../src/entity/fine/fine';
import FineHandoutEvent from '../../../src/entity/fine/fineHandoutEvent';
import UserFineGroup from '../../../src/entity/fine/userFineGroup';

describe('TransferPdfService', () => {
  let connection: DataSource;
  let service: TransferPdfService;
  let users: User[];
  let compileHtmlStub: SinonStub;

  before(async () => {
    connection = await Database.initialize();
    await truncateAllTables(connection);
    users = await new UserSeeder().seed();
    service = new TransferPdfService(connection.manager);
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
    it('should return correct parameters for undecorated transfer', async () => {
      const transfer = await Transfer.save({
        fromId: users[0].id,
        toId: users[1].id,
        amountInclVat: DineroTransformer.Instance.from(100),
        description: 'Test transfer',
        version: 1,
      });

      const params = await service.getParameters(transfer);

      expect(params.transferId).to.equal(transfer.id.toString());
      expect(params.fromUserFirstName).to.equal(users[0].firstName);
      expect(params.fromUserLastName).to.equal(users[0].lastName);
      expect(params.fromAccount).to.equal(users[0].id.toString());
      expect(params.toUserFirstName).to.equal(users[1].firstName);
      expect(params.toUserLastName).to.equal(users[1].lastName);
      expect(params.toAccount).to.equal(users[1].id.toString());
      expect(params.description).to.equal('Test transfer');
      expect(params.amount).to.equal(transfer.amountInclVat.toFormat());
    });

    it('should throw error if transfer has invoice', async () => {
      const transfer = await Transfer.save({
        fromId: users[0].id,
        toId: users[1].id,
        amountInclVat: DineroTransformer.Instance.from(100),
        description: 'Test transfer',
        version: 1,
      });

      const invoice = await Invoice.save({
        to: users[1],
        transfer,
        addressee: 'Test Addressee',
        reference: 'TEST-REF-001',
        street: 'Test Street',
        postalCode: '1234AB',
        city: 'Test City',
        country: 'Netherlands',
        version: 1,
      });

      transfer.invoice = invoice;
      await Transfer.save(transfer);

      await expect(service.getParameters(transfer)).to.be.rejectedWith(
        Error,
        'Transfer is not a base transfer and cannot be used to generate a PDF directly.',
      );
    });

    it('should throw error if transfer has writeOff', async () => {
      const transfer = await Transfer.save({
        fromId: null,
        toId: users[0].id,
        amountInclVat: DineroTransformer.Instance.from(100),
        description: 'Test transfer',
        version: 1,
      });

      const writeOff = await WriteOff.save({
        to: users[0],
        transfer,
        amount: DineroTransformer.Instance.from(100),
        version: 1,
      });

      transfer.writeOff = writeOff;
      await Transfer.save(transfer);

      await expect(service.getParameters(transfer)).to.be.rejectedWith(
        Error,
        'Transfer is not a base transfer and cannot be used to generate a PDF directly.',
      );
    });

    it('should throw error if transfer has deposit', async () => {
      const transfer = await Transfer.save({
        fromId: null,
        toId: users[0].id,
        amountInclVat: DineroTransformer.Instance.from(100),
        description: 'Test transfer',
        version: 1,
      });

      const stripePaymentIntent = await StripePaymentIntent.save({
        stripeId: 'test_pi_123',
        amount: DineroTransformer.Instance.from(100),
        paymentIntentStatuses: [],
        version: 1,
      });

      const deposit = await StripeDeposit.save({
        transfer,
        to: users[0],
        stripePaymentIntent,
        version: 1,
      });

      transfer.deposit = deposit;
      await Transfer.save(transfer);

      await expect(service.getParameters(transfer)).to.be.rejectedWith(
        Error,
        'Transfer is not a base transfer and cannot be used to generate a PDF directly.',
      );
    });

    it('should throw error if transfer has payoutRequest', async () => {
      const transfer = await Transfer.save({
        fromId: users[0].id,
        toId: null,
        amountInclVat: DineroTransformer.Instance.from(100),
        description: 'Test transfer',
        version: 1,
      });

      const payoutRequest = await PayoutRequest.save({
        requestedBy: users[0],
        transfer,
        amount: DineroTransformer.Instance.from(100),
        bankAccountNumber: 'NL91ABNA0417164300',
        bankAccountName: 'Test Account',
        version: 1,
      });

      transfer.payoutRequest = payoutRequest;
      await Transfer.save(transfer);

      await expect(service.getParameters(transfer)).to.be.rejectedWith(
        Error,
        'Transfer is not a base transfer and cannot be used to generate a PDF directly.',
      );
    });

    it('should throw error if transfer has fine', async () => {
      const transfer = await Transfer.save({
        fromId: users[0].id,
        toId: null,
        amountInclVat: DineroTransformer.Instance.from(100),
        description: 'Test transfer',
        version: 1,
      });

      const fineHandoutEvent = await FineHandoutEvent.save({
        referenceDate: new Date(),
        createdBy: users[0],
        version: 1,
      });

      const userFineGroup = await UserFineGroup.save({
        user: users[0],
        userId: users[0].id,
        version: 1,
      });

      const fine = await Fine.save({
        fineHandoutEvent,
        userFineGroup,
        transfer,
        amount: DineroTransformer.Instance.from(100),
        version: 1,
      });

      transfer.fine = fine;
      await Transfer.save(transfer);

      await expect(service.getParameters(transfer)).to.be.rejectedWith(
        Error,
        'Transfer is not a base transfer and cannot be used to generate a PDF directly.',
      );
    });

    it('should throw error if transfer not found', async () => {
      const transfer = Object.assign(new Transfer(), { id: 99999 });

      await expect(service.getParameters(transfer)).to.be.rejectedWith(
        Error,
        'Transfer not found',
      );
    });
  });

  describe('createPdfBuffer', () => {
    it('should create PDF buffer for undecorated transfer', async () => {
      const transfer = await Transfer.save({
        fromId: users[0].id,
        toId: users[1].id,
        amountInclVat: DineroTransformer.Instance.from(100),
        description: 'Test transfer',
        version: 1,
      });

      const pdfBuffer = await service.createPdfBuffer(transfer);

      expect(pdfBuffer).to.be.instanceOf(Buffer);
      expect(compileHtmlStub).to.have.been.calledOnce;
    });
  });
});

