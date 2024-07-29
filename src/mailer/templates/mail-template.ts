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

import Mail from 'nodemailer/lib/mailer';
import MailContent from './mail-content';
import fs from 'fs';
import path from 'path';

interface StyledTemplateFields {
  subject: string;
  htmlSubject: string;
  shortTitle: string;
  body: string;
  weekDay: string;
  date: string;
  serviceEmail: string;
  reasonForEmail: string;
}

export enum Language {
  DUTCH = 'nl-NL',
  ENGLISH = 'en-US',
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

    let styledHtml = fs.readFileSync(path.join(__dirname, './template.html')).toString();
    const styledHtmlTemplateFields: StyledTemplateFields = {
      subject,
      htmlSubject: subject.replaceAll(' ', '&nbsp;'),
      body: html,
      shortTitle: 'SudoSOS notification',
      weekDay: new Date().toLocaleString(language, { weekday: 'long' }),
      date: new Date().toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' }),
      serviceEmail: 'sudosos@gewis.nl',
      reasonForEmail: '',
    };
    Object.entries(styledHtmlTemplateFields).forEach(([key, value]) => {
      styledHtml = styledHtml.replaceAll(`{{ ${key} }}`, value);
    });

    return {
      ...this.baseMailOptions,
      text,
      html: styledHtml,
      subject,
    };
  }
}
