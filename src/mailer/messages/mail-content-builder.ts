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

type MailContentFunction<T> = string | ((context: T) => string);

export interface MailContentFunctions<T> {
  getHTML: MailContentFunction<T>;
  getText: MailContentFunction<T>;
  getSubject: MailContentFunction<T>;

  /**
   * Short title used as the header in a templated email
   */
  getTitle: MailContentFunction<T>;

  /**
   * Short, bottom text explaining in the templated email why
   * the received got this email.
   */
  getReasonForEmail?: MailContentFunction<T>;
}

export interface MailContent {
  text: string;
  html: string;
  subject: string;
  /**
   * Short title used as the header in a templated email
   */
  title: string;
  /**
   * Short, bottom text explaining in the templated email why
   * the received got this email.
   */
  reason?: string;
}

export default class MailContentBuilder<T> {
  constructor(mail: MailContentFunctions<T>) {
    this.mail = mail;
  }

  protected mail: MailContentFunctions<T>;

  public getContent(context: T): MailContent {
    const text = typeof this.mail.getText === 'string' ? this.mail.getText : this.mail.getText(context);
    const html = typeof this.mail.getHTML === 'string' ? this.mail.getHTML : this.mail.getHTML(context);
    const subject = typeof this.mail.getSubject === 'string' ? this.mail.getSubject : this.mail.getSubject(context);
    const title = typeof this.mail.getTitle === 'string' ? this.mail.getTitle : this.mail.getTitle(context);

    let reason: string | undefined;
    if (this.mail.getReasonForEmail !== undefined && typeof this.mail.getReasonForEmail === 'string') {
      reason = this.mail.getReasonForEmail;
    } else if (this.mail.getReasonForEmail !== undefined && typeof this.mail.getReasonForEmail !== 'string') {
      reason = this.mail.getReasonForEmail(context);
    }

    return { text, html, subject, title, reason };
  }
}
