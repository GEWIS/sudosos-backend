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

/**
 * This is the module page of mailer.
 *
 * @module internal/mailer
 */

import log4js, { Logger } from 'log4js';
import { Transporter } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import User from '../entity/user/user';
import MailMessage, { Language } from './mail-message';
import createSMTPTransporter from './transporter';
import { applyConfiguredLogLevel } from '../helpers/logging';

/**
 * Sends rendered email messages through nodemailer.
 *
 * Mailer has no queue logic of its own. Asynchronous delivery is handled
 * one level up by the `send-notification` task (Notifier dispatches a task;
 * the worker calls into Mailer when it runs).
 */
export default class Mailer {
  private static instance: Mailer | undefined;

  private readonly transporter: Transporter;

  private readonly logger: Logger = log4js.getLogger('Mailer');

  constructor() {
    applyConfiguredLogLevel(this.logger);
    this.transporter = createSMTPTransporter();
    Mailer.instance = this;
  }

  static getInstance(): Mailer {
    if (this.instance === undefined) {
      throw new Error('Mailer has not been initialized. Create an instance first using: new Mailer()');
    }
    return this.instance;
  }

  async send<T>(
    to: User,
    template: MailMessage<T>,
    language: Language = Language.ENGLISH,
    extraOptions?: Mail.Options,
  ): Promise<void> {
    const mailOptions = {
      ...template.getOptions(to, language),
      ...extraOptions,
      to: to.email,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.info({
        template: template.constructor.name,
        to: to.email,
      }, 'Email sent.');
    } catch (error) {
      this.logger.error({
        err: (error as Error).message,
        template: template.constructor.name,
        to: to.email,
      }, 'Failed to send email.');
      throw error;
    }
  }

  /**
   * TEST-ONLY: reset the singleton so suites can rebuild it against a fresh
   * SMTP stub.
   */
  static reset(): void {
    this.instance = undefined;
  }
}
