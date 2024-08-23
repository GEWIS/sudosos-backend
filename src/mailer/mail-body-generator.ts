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
import { Language, MailLanguageMap } from './mail-message';
import User from '../entity/user/user';
import fs from 'fs';
import path from 'path';

interface TemplateFields {
  subject: string;
  htmlSubject: string;
  shortTitle: string;
  body: string;
  weekDay: string;
  date: string;
  serviceEmail: string;
  reasonForEmail: string;
}

export const templateFieldDefault: Record<
keyof Pick<TemplateFields, 'serviceEmail' | 'reasonForEmail'>
, { [key in Language]: string }
> = {
  serviceEmail: {
    'en-US': process.env.SMTP_FROM?.split('<')[1].split('>')[0] || '',
    'nl-NL': process.env.SMTP_FROM?.split('<')[1].split('>')[0] || '',
  },
  reasonForEmail: {
    'en-US': 'You are receiving this email because you are registered as a SudoSOS user. Learn more about how we treat your personal data on <a href="https://gew.is/privacy">https://gew.is/privacy</a>.',
    'nl-NL': 'Je ontvangt deze email omdat je bent geregistreerd als een SudoSOS gebruiker. Lees hoe wij je persoonlijke informatie verwerken op <a href="https://gew.is/privacy">https://gew.is/privacy</a>.',
  },
};

export default class MailBodyGenerator<T> {
  private readonly template: string;

  constructor(private language: Language) {
    this.template = fs.readFileSync(path.join(__dirname, '../../static/mailer/template.html')).toString();
  }

  /**
   * Get a localized salutation (including the comma afterward)
   * @private
   */
  private getLocalizedSalutation(to: User) {
    switch (this.language) {
      case Language.DUTCH:
        return `Beste ${to.firstName}`;
      case Language.ENGLISH:
        return `Dear ${to.firstName}`;
      default:
        throw new Error(`Unknown language: "${this.language}"`);
    }
  }

  private getLocalizedClosing() {
    switch (this.language) {
      case Language.DUTCH:
        return `Met vriendelijke groet,
SudoSOS`;
      case Language.ENGLISH:
        return `Kind regards,
SudoSOS`;
      default:
        throw new Error(`Unknown language: "${this.language}"`);
    }
  }

  /**
   * Add a salutation to the given html in the given language for the given user
   * @param html
   * @param to
   * @private
   */
  public getHtmlWithSalutation(html: string, to: User) {
    return `<p>${this.getLocalizedSalutation(to)},</p>
${html}`;
  }

  public getTextWithSalutation(text: string, to: User) {
    return `${this.getLocalizedSalutation(to)},

${text}

${this.getLocalizedClosing()}`;
  }

  public getContents(
    contents: MailLanguageMap<T>,
    options: T,
    to: User,
  ) {
    const { text, html, subject, title, reason } = contents[this.language].getContent(options);

    let styledHtml = this.template;
    const styledHtmlTemplateFields: TemplateFields = {
      subject,
      htmlSubject: subject.replaceAll(' ', '&nbsp;'),
      body: this.getHtmlWithSalutation(html, to),
      shortTitle: title,
      weekDay: new Date().toLocaleString(this.language, { weekday: 'long' }),
      date: new Date().toLocaleDateString(this.language, { day: 'numeric', month: 'long', year: 'numeric' }),
      serviceEmail: templateFieldDefault.serviceEmail[this.language],
      reasonForEmail: reason ?? templateFieldDefault.reasonForEmail[this.language],
    };
    Object.entries(styledHtmlTemplateFields).forEach(([key, value]) => {
      styledHtml = styledHtml.replaceAll(`{{ ${key} }}`, value);
    });

    const styledText = this.getTextWithSalutation(text, to);

    return { text: styledText, html: styledHtml, subject };
  }
}
