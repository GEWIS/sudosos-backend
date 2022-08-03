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
import Mail from 'nodemailer/lib/mailer';
import MailContent from './mail-content';

export enum Language {
  DUTCH = 'dutch',
  ENGLISH = 'english',
}

export type MailLanguageMap<T> = {
  [key in Language]: MailContent<T>;
};

export default class MailTemplate<T> {
  protected baseMailOptions: Mail.Options = {
    from: process.env.SMTP_FROM,
  };

  protected contentOptions: T;

  protected mailContents: MailLanguageMap<T>;

  public constructor(options: T, mailContents: MailLanguageMap<T>) {
    this.contentOptions = options;
    this.mailContents = mailContents;
  }

  /**
   * Get the base options
   */
  getOptions(language: Language): Mail.Options {
    if (this.mailContents[language] === undefined) throw new Error(`Unknown language: ${language}`);
    const { text, html, subject } = this.mailContents[language].getContent(this.contentOptions);

    return {
      ...this.baseMailOptions,
      text,
      html,
      subject,
    };
  }
}
