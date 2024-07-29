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
import { Language, MailLanguageMap } from '../mail-message';
import User from '../../entity/user/user';
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

const templateFieldDefault: Record<
keyof Pick<TemplateFields, 'serviceEmail' | 'reasonForEmail'>
, Record<Language, string>
> = {
  serviceEmail: {
    [Language.DUTCH]: process.env.STMP_USERNAME || '',
    [Language.ENGLISH]: process.env.STMP_USERNAME || '',
  },
  reasonForEmail: {
    [Language.ENGLISH]: 'You are receiving this email because you are registered as a SudoSOS user. Learn more about how we treat your personal data on <a href="https://gew.is/privacy">https://gew.is/privacy</a>.',
    [Language.DUTCH]: 'Je ontvangt deze email omdat je bent geregistreerd als een SudoSOS gebruiker. Lees hoe wij je persoonlijke informatie verwerken op <a href="https://gew.is/privacy">https://gew.is/privacy</a>.',
  },
};

export default class MailBodyGenerator<T> {
  private readonly template: string;

  constructor() {
    this.template = fs.readFileSync(path.join(__dirname, './template.html')).toString();
  }

  /**
   * Get a localized salutation (including the comma afterwards)
   * @param to
   * @param language
   * @private
   */
  private getLocalizedSalutation(to: User, language: Language) {
    switch (language) {
      case Language.DUTCH:
        return `Beste ${to.firstName},`;
      case Language.ENGLISH:
        return `Dear ${to.firstName},`;
      default:
        throw new Error(`Unknown language: "${language}"`);
    }
  }

  /**
   * Add a salutation to the given html in the given language for the given user
   * @param html
   * @param to
   * @param language
   * @private
   */
  private getHtmlWithSalutation(html: string, to: User, language: Language) {
    return `<p>${this.getLocalizedSalutation(to, language)}</p>
${html}`;
  }

  public getContents(
    contents: MailLanguageMap<T>,
    options: T,
    to: User,
    language: Language,
  ) {
    const { text, html, subject, title, reason } = contents[language].getContent(options);

    let styledHtml = this.template;
    const styledHtmlTemplateFields: TemplateFields = {
      subject,
      htmlSubject: subject.replaceAll(' ', '&nbsp;'),
      body: this.getHtmlWithSalutation(html, to, language),
      shortTitle: title,
      weekDay: new Date().toLocaleString(language, { weekday: 'long' }),
      date: new Date().toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' }),
      serviceEmail: templateFieldDefault.serviceEmail[language],
      reasonForEmail: reason ?? templateFieldDefault.reasonForEmail[language],
    };
    Object.entries(styledHtmlTemplateFields).forEach(([key, value]) => {
      styledHtml = styledHtml.replaceAll(`{{ ${key} }}`, value);
    });

    return { text, html: styledHtml, subject };
  }
}
