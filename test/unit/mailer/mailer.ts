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
import sinon, { SinonSandbox, SinonStub } from 'sinon';
import { DataSource } from 'typeorm';
import Mailer from '../../../src/mailer';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import HelloWorld from '../../../src/mailer/messages/hello-world';
import { Language } from '../../../src/mailer/mail-message';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import fs from 'fs';
import { templateFieldDefault } from '../../../src/mailer/mail-body-generator';
import { rootStubs } from '../../root-hooks';
import { Queue } from 'bullmq';

describe('Mailer', () => {
  let ctx: {
    connection: DataSource,
    user: User,
    htmlMailTemplate: string,
  };

  let sandbox: SinonSandbox;
  let queueAddStub: SinonStub;

  const fromEmail = process.env.SMTP_FROM?.split('<')[1].split('>')[0] ?? '';

  before(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const user = await User.save({
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      email: 'mail@example.com',
    } as User);

    const htmlMailTemplate = fs.readFileSync('./static/mailer/template.html').toString();

    ctx = {
      connection,
      user,
      htmlMailTemplate,
    };
  });

  beforeEach(async () => {
    // Restore the default stub
    rootStubs?.mail.restore();

    // Reset the mailer, because it was created with an old, expired stub
    Mailer.reset();

    sandbox = sinon.createSandbox();
    queueAddStub = sandbox.stub(Queue.prototype, 'add').resolves({ id: 'mock-id' } as any);
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should be a singleton', () => {
    const mailer = Mailer.getInstance();
    const mailer2 = Mailer.getInstance();
    expect(mailer).to.equal(mailer2);
  });

  // eslint-disable-next-line func-names
  it('should correctly queue mail in English by default', async function () {
    const mailer = Mailer.getInstance();
    const template = new HelloWorld({ name: ctx.user.firstName });
    await mailer.send(ctx.user, template);

    expect(queueAddStub.calledOnce).to.be.true;
    const [jobName, jobData] = queueAddStub.firstCall.args;

    const styledHtml = ctx.htmlMailTemplate
      .replaceAll('{{ subject }}', 'Hello world!')
      .replaceAll('{{ htmlSubject }}', 'Hello&nbsp;world!')
      .replaceAll('{{ weekDay }}', new Date().toLocaleString('en-US', { weekday: 'long' }))
      .replaceAll('{{ date }}', new Date().toLocaleString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }))
      .replaceAll('{{ shortTitle }}', 'Hello world!')
      .replaceAll('{{ body }}', '<p>Dear Admin,</p>\n<p>Hello world, Admin!</p>')
      .replaceAll('{{ reasonForEmail }}', templateFieldDefault.reasonForEmail['en-US'])
      .replaceAll('{{ serviceEmail }}', fromEmail);

    expect(jobName).to.equal('send-email');
    expect(jobData.html.trim()).to.equal(styledHtml.trim());
  });

  // eslint-disable-next-line func-names
  it('should correctly queue mail in Dutch', async function () {
    const mailer = Mailer.getInstance();
    await mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }), Language.DUTCH);

    expect(queueAddStub.calledOnce).to.be.true;
    const [jobName, jobData] = queueAddStub.firstCall.args;

    const styledHtml = ctx.htmlMailTemplate
      .replaceAll('{{ subject }}', 'Hallo wereld!')
      .replaceAll('{{ htmlSubject }}', 'Hallo&nbsp;wereld!')
      .replaceAll('{{ weekDay }}', new Date().toLocaleString('nl-NL', { weekday: 'long' }))
      .replaceAll('{{ date }}', new Date().toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }))
      .replaceAll('{{ shortTitle }}', 'Hallo wereld!')
      .replaceAll('{{ body }}', '<p>Beste Admin,</p>\n<p>Hallo wereld, Admin!</p>')
      .replaceAll('{{ reasonForEmail }}', templateFieldDefault.reasonForEmail['nl-NL'])
      .replaceAll('{{ serviceEmail }}', fromEmail);

    expect(jobName).to.equal('send-email');
    expect(jobData.html.trim()).to.equal(styledHtml.trim());
  });

  // eslint-disable-next-line func-names
  it('should catch error if any exist', async function () {
    const mailer = Mailer.getInstance();

    const promise = mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }), 'binary' as any);

    await expect(promise).to.eventually.be.rejected;
  });
});
