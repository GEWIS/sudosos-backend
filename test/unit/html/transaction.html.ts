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
import { createTransactionPdf, ITransactionPdf } from '../../../src/html/transaction.html';

describe('transaction.html', () => {
  describe('createTransactionPdf', () => {
    it('should generate HTML for transaction with single item', () => {
      const options: ITransactionPdf = {
        transactionId: '123',
        fromUserFirstName: 'John',
        fromUserLastName: 'Doe',
        fromId: '1',
        createdByUserFirstName: 'Jane',
        createdByUserLastName: 'Smith',
        date: '01-01-2024',
        items: [
          {
            description: 'Test Product',
            qty: 2,
            unit: '€1,00',
            unitPriceExclVat: 0.83,
            vatRate: 21,
          },
        ],
        serviceEmail: 'test@example.com',
      };

      const html = createTransactionPdf(options);

      expect(html).to.be.a('string');
      expect(html).to.include('Transaction PDF');
      expect(html).to.include('Transaction Info');
      expect(html).to.include('Transaction ID');
      expect(html).to.include('123');
      expect(html).to.include('test@example.com');
      expect(html).to.include('John Doe');
      expect(html).to.include('Jane Smith');
      expect(html).to.include('Test Product');
    });

    it('should generate HTML for transaction with multiple items and different VAT rates', () => {
      const options: ITransactionPdf = {
        transactionId: '456',
        fromUserFirstName: 'Alice',
        fromUserLastName: 'Brown',
        fromId: '2',
        createdByUserFirstName: 'Bob',
        createdByUserLastName: 'White',
        date: '15-03-2024',
        items: [
          {
            description: 'Product A',
            qty: 1,
            unit: '€10,00',
            unitPriceExclVat: 8.26,
            vatRate: 21,
          },
          {
            description: 'Product B',
            qty: 3,
            unit: '€5,00',
            unitPriceExclVat: 4.13,
            vatRate: 9,
          },
          {
            description: 'Product C',
            qty: 2,
            unit: '€20,00',
            unitPriceExclVat: 16.53,
            vatRate: 21,
          },
        ],
        serviceEmail: 'finance@example.com',
      };

      const html = createTransactionPdf(options);

      expect(html).to.be.a('string');
      expect(html).to.include('Product A');
      expect(html).to.include('Product B');
      expect(html).to.include('Product C');
      expect(html).to.include('21%');
      expect(html).to.include('9%');
    });

    it('should calculate VAT groups correctly', () => {
      const options: ITransactionPdf = {
        transactionId: '789',
        fromUserFirstName: 'Test',
        fromUserLastName: 'User',
        fromId: '3',
        createdByUserFirstName: 'Admin',
        createdByUserLastName: 'User',
        date: '01-01-2024',
        items: [
          {
            description: 'Item 1',
            qty: 1,
            unit: '€10,00',
            unitPriceExclVat: 8.26,
            vatRate: 21,
          },
          {
            description: 'Item 2',
            qty: 1,
            unit: '€10,00',
            unitPriceExclVat: 8.26,
            vatRate: 21,
          },
        ],
        serviceEmail: 'test@example.com',
      };

      const html = createTransactionPdf(options);

      expect(html).to.be.a('string');
      expect(html).to.include('21%');
    });

    it('should handle empty items array', () => {
      const options: ITransactionPdf = {
        transactionId: '999',
        fromUserFirstName: 'Empty',
        fromUserLastName: 'Cart',
        fromId: '4',
        createdByUserFirstName: 'System',
        createdByUserLastName: 'User',
        date: '01-01-2024',
        items: [],
        serviceEmail: 'test@example.com',
      };

      const html = createTransactionPdf(options);

      expect(html).to.be.a('string');
      // With no items, subtotal and totals render as zero.
      expect(html).to.include('0,00');
    });

    it('should format currency correctly in Dutch locale', () => {
      const options: ITransactionPdf = {
        transactionId: '100',
        fromUserFirstName: 'Currency',
        fromUserLastName: 'Test',
        fromId: '5',
        createdByUserFirstName: 'Test',
        createdByUserLastName: 'User',
        date: '01-01-2024',
        items: [
          {
            description: 'Expensive Item',
            qty: 1,
            unit: '€1.234,56',
            unitPriceExclVat: 1020.30,
            vatRate: 21,
          },
        ],
        serviceEmail: 'test@example.com',
      };

      const html = createTransactionPdf(options);

      expect(html).to.be.a('string');
      expect(html).to.include('€');
    });
  });
});
