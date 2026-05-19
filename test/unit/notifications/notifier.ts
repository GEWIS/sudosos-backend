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
import dinero from 'dinero.js';
import '../../../src/notifications';
import Notifier from '../../../src/notifications/notifier';
import { NotificationChannel } from '../../../src/notifications/channels/abstract-channel';
import { EmailChannel } from '../../../src/notifications/channels/mail-channel';
import {
  NotificationTypes,
  TemplateObject,
  TemplateOptions,
} from '../../../src/notifications/notification-types';
import {
  ForgotEventPlanningOptions,
  MembershipExpiryNotificationOptions,
  TransactionNotificationOptions,
  UserDebtNotificationOptions,
  UserGotInactiveAdministrativeCostOptions,
  WelcomeToSudososOptions,
} from '../../../src/notifications/notification-options';
import User, { UserType } from '../../../src/entity/user/user';
import UserNotificationPreference, {
  NotificationChannels,
} from '../../../src/entity/notifications/user-notification-preference';
import NotificationLog from '../../../src/entity/notifications/notification-log';
import Task, { TaskStatus } from '../../../src/entity/task';
import TaskService from '../../../src/service/task-service';
import { registerAllTasks, SEND_NOTIFICATION_TASK_TYPE } from '../../../src/tasks';
import { defaultBefore, finishTestDB } from '../../helpers/test-helpers';
import Mailer from '../../../src/mailer';
import { TransactionResponse } from '../../../src/controller/response/transaction-response';
import { rootStubs } from '../../root-hooks';

class TestEmailChannel extends NotificationChannel<
TemplateObject<TemplateOptions, TemplateOptions>,
TemplateOptions,
TemplateOptions
> {
  public readonly name = NotificationChannels.EMAIL;

  public readonly templates = {
    [NotificationTypes.ChangedPin]: { build: (params: TemplateOptions) => params },
    [NotificationTypes.HelloWorld]: { build: (params: TemplateOptions) => params },
  };

  public constructor(private readonly sendStub: SinonStub) {
    super();
  }

  public async apply(
    template: TemplateObject<TemplateOptions, TemplateOptions>,
    params: TemplateOptions,
  ): Promise<TemplateOptions> {
    return template.build(params);
  }

  public async send(user: User, content: TemplateOptions): Promise<void> {
    await this.sendStub(user, content);
  }
}

describe('Notifier task delivery', () => {
  let connection: DataSource;
  let user: User;
  let sandbox: SinonSandbox;

  beforeAll(async () => {
    ({ connection } = await defaultBefore());
    user = await User.save(Object.assign(new User(), {
      firstName: 'Queue',
      lastName: 'Recipient',
      email: 'queue-recipient@example.test',
      type: UserType.LOCAL_USER,
      active: true,
      tosRequired: false,
      canGoIntoDebt: true,
    }));
  });

  afterAll(async () => {
    await finishTestDB(connection);
  });

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    registerAllTasks();
    Mailer.reset();
    new Mailer();
    await NotificationLog.createQueryBuilder().delete().execute();
    await UserNotificationPreference.createQueryBuilder().delete().execute();
    await Task.createQueryBuilder().delete().execute();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('rejects unknown notification types without creating a task', async () => {
    const notifier = new Notifier([]);

    await expect(notifier.notify({
      type: 'UnknownNotification' as NotificationTypes,
      userId: user.id,
      params: {},
    })).to.be.rejectedWith(/Unknown notification type/);

    expect(await Task.count()).to.equal(0);
  });

  it('rejects notifications for users that no longer exist', async () => {
    const notifier = new Notifier([]);

    await expect(notifier.notify({
      type: NotificationTypes.ChangedPin,
      userId: 9_999_999,
      params: {},
    })).to.be.rejectedWith(/Could not find user/);
  });

  it('marks the task completed when notification delivery succeeds', async () => {
    const send = sandbox.stub().resolves();
    const notifier = new Notifier([new TestEmailChannel(send)]);
    sandbox.stub(Notifier, 'getInstance').returns(notifier);

    await notifier.notify({
      type: NotificationTypes.ChangedPin,
      userId: user.id,
      params: {},
    });
    expect(await TaskService.processNextEligible()).to.be.true;

    const task = await Task.findOneByOrFail({ type: SEND_NOTIFICATION_TASK_TYPE });
    expect(task.status).to.equal(TaskStatus.COMPLETED);
    expect(send.calledOnce).to.be.true;
    expect(await NotificationLog.count()).to.equal(1);
  });

  it('keeps the task retryable when a channel lacks the requested template', async () => {
    const send = sandbox.stub().resolves();
    const channel = new TestEmailChannel(send);
    delete (channel.templates as Partial<typeof channel.templates>)[NotificationTypes.ChangedPin];
    const notifier = new Notifier([channel]);
    sandbox.stub(Notifier, 'getInstance').returns(notifier);

    await notifier.notify({
      type: NotificationTypes.ChangedPin,
      userId: user.id,
      params: {},
    });
    await TaskService.processNextEligible();

    const task = await Task.findOneByOrFail({ type: SEND_NOTIFICATION_TASK_TYPE });
    expect(task.status).to.equal(TaskStatus.PENDING);
    expect(task.lastError).to.contain('has not implemented');
    expect(send.called).to.be.false;
  });

  it('keeps the task retryable when a channel fails', async () => {
    const send = sandbox.stub().rejects(new Error('SMTP unavailable'));
    const notifier = new Notifier([new TestEmailChannel(send)]);
    sandbox.stub(Notifier, 'getInstance').returns(notifier);

    await notifier.notify({
      type: NotificationTypes.ChangedPin,
      userId: user.id,
      params: {},
    });
    await TaskService.processNextEligible();

    const task = await Task.findOneByOrFail({ type: SEND_NOTIFICATION_TASK_TYPE });
    expect(task.status).to.equal(TaskStatus.PENDING);
    expect(task.attempts).to.equal(1);
    expect(task.lastError).to.contain('SMTP unavailable');
    expect(await NotificationLog.count()).to.equal(0);
  });

  it('completes without delivery when the user opts out before execution', async () => {
    const preference = await UserNotificationPreference.save({
      userId: user.id,
      user,
      type: NotificationTypes.HelloWorld,
      channel: NotificationChannels.EMAIL,
      enabled: true,
    } as UserNotificationPreference);
    const send = sandbox.stub().resolves();
    const notifier = new Notifier([new TestEmailChannel(send)]);
    sandbox.stub(Notifier, 'getInstance').returns(notifier);

    await notifier.notify({
      type: NotificationTypes.HelloWorld,
      userId: user.id,
      params: {},
    });
    preference.enabled = false;
    await UserNotificationPreference.save(preference);
    await TaskService.processNextEligible();

    const task = await Task.findOneByOrFail({ type: SEND_NOTIFICATION_TASK_TYPE });
    expect(task.status).to.equal(TaskStatus.COMPLETED);
    expect(send.called).to.be.false;
    const log = await NotificationLog.findOneByOrFail({ user: { id: user.id } });
    expect(log.handler).to.be.null;
  });

  it('renders a queued transaction receipt after payload serialization', async () => {
    await UserNotificationPreference.save({
      userId: user.id,
      user,
      type: NotificationTypes.TransactionNotificationSelf,
      channel: NotificationChannels.EMAIL,
      enabled: true,
    } as UserNotificationPreference);
    const notifier = new Notifier([new EmailChannel()]);
    sandbox.stub(Notifier, 'getInstance').returns(notifier);
    const money = (amount: number) => ({ amount, currency: 'EUR', precision: 2 });
    const transaction = {
      from: { id: user.id },
      createdBy: { id: user.id },
      totalPriceInclVat: money(450),
      subTransactions: [{
        subTransactionRows: [{
          amount: 2,
          product: {
            name: 'Queued drink',
            priceInclVat: money(225),
          },
          totalPriceInclVat: money(450),
        }],
      }],
    } as TransactionResponse;

    await notifier.notify({
      type: NotificationTypes.TransactionNotificationSelf,
      userId: user.id,
      params: new TransactionNotificationOptions(
        transaction,
        dinero({ amount: -450, currency: 'EUR', precision: 2 }),
      ),
    });
    await TaskService.processNextEligible();

    const task = await Task.findOneByOrFail({ type: SEND_NOTIFICATION_TASK_TYPE });
    expect(task.status).to.equal(TaskStatus.COMPLETED);
    expect(rootStubs!.sendMail.calledOnce).to.be.true;
    const [{ html }] = rootStubs!.sendMail.firstCall.args as [{ html: string }];
    expect(html).to.include('Queued drink');
    expect(html).to.include('debt');
  });

  it('renders queued notification templates with their serialized parameters', async () => {
    const notifier = new Notifier([new EmailChannel()]);
    sandbox.stub(Notifier, 'getInstance').returns(notifier);
    const amount = dinero({ amount: -1234, currency: 'EUR', precision: 2 });
    const notifications = [
      {
        type: NotificationTypes.ForgotEventPlanning,
        params: new ForgotEventPlanningOptions('Queue Recipient', 'Board meeting'),
      },
      {
        type: NotificationTypes.MembershipExpiryNotification,
        params: new MembershipExpiryNotificationOptions(amount),
      },
      {
        type: NotificationTypes.UserDebtNotification,
        params: new UserDebtNotificationOptions('https://sudosos.example.test', amount),
      },
      {
        type: NotificationTypes.UserGotInactiveAdministrativeCost,
        params: new UserGotInactiveAdministrativeCostOptions(amount),
      },
      {
        type: NotificationTypes.WelcomeToSudosos,
        params: new WelcomeToSudososOptions('https://sudosos.example.test'),
      },
    ];

    for (const notification of notifications) {
      await notifier.notify<TemplateOptions>({
        ...notification,
        userId: user.id,
      });
    }
    while (await TaskService.processNextEligible()) {
      // Drain every notification through the production task handler.
    }

    expect(rootStubs!.sendMail.callCount).to.equal(notifications.length);
    const rendered = rootStubs!.sendMail
      .getCalls()
      .map(call => (call.args[0] as { html: string }).html)
      .join('\n');
    expect(rendered).to.include('Board meeting');
    expect(rendered).to.include('membership at GEWIS has expired');
    expect(rendered).to.include('currently have a balance');
    expect(rendered).to.include('administration fee');
    expect(rendered).to.include('Welcome to SudoSOS');
    expect(await Task.countBy({ status: TaskStatus.COMPLETED }))
      .to.equal(notifications.length);
  });
});
