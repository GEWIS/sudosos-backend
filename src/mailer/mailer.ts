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
import { Transporter } from 'nodemailer';
import log4js, { Logger } from 'log4js';
import createSMTPTransporter from './transporter';
import User from '../entity/user/user';
import AbstractMailTemplate, { Language } from './templates/abstract-mail-template';

export default class Mailer {
  private static instance: Mailer;

  private transporter: Transporter;

  private logger: Logger = log4js.getLogger('Mailer');

  constructor() {
    this.transporter = createSMTPTransporter();
    this.logger.level = process.env.LOG_LEVEL;
  }

  static getInstance(): Mailer {
    if (this.instance === undefined) {
      this.instance = new Mailer();
    }
    return this.instance;
  }

  async send<T>(
    to: User, template: AbstractMailTemplate<T>, language: Language = Language.ENGLISH,
  ) {
    this.logger.trace('Send email', template.constructor.name, 'to user');
    try {
      await this.transporter.sendMail({
        ...template.getOptions(language),
        to: to.email,
      });
    } catch (error: any) {
      this.logger.error('Could not send email:', error.message);
    }
  }
}
