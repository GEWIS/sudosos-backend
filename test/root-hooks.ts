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
import * as mocha from 'mocha';
import sinon from 'sinon';
import nodemailer, { Transporter } from 'nodemailer';

/**
 * Object containing all global stubs that are set before each test case.
 * Note that these stubs are reinitialized before each test case.
 * Therefore, if you wish to restore these stubs to create your own,
 * ensure that you restore them before each test case.
 */
export let rootStubs: {
  /**
   * Mail stub, which mocks a new SMTP connection.
   */
  mail: sinon.SinonStub;
} | undefined;

export const mochaHooks: mocha.RootHookObject = {
  beforeEach: () => {
    const sendMailFake = sinon.spy();
    const mail = sinon.stub(nodemailer, 'createTransport').returns({
      sendMail: sendMailFake,
    } as any as Transporter);
    rootStubs = { mail };
  },
  afterEach: () => {
    rootStubs?.mail.restore();
  },
};
