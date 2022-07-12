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

export enum Language {
  DUTCH = 'dutch',
  ENGLISH = 'english',
}

export default abstract class AbstractMailTemplate<T> {
  protected baseMailOptions: Mail.Options = {
    from: process.env.SMTP_FROM,
  };

  protected contentOptions: T;

  public constructor(options: T) {
    this.contentOptions = options;
  }

  protected abstract getHTMLEnglish(): string;

  protected abstract getTextEnglish(): string;

  protected abstract getSubjectEnglish(): string;

  protected abstract getHTMLDutch(): string;

  protected abstract getTextDutch(): string;

  protected abstract getSubjectDutch(): string;

  /**
   * Get the base options
   */
  getOptions(language: Language): Mail.Options {
    let text: string;
    let html: string;
    let subject: string;
    switch (language) {
      case Language.DUTCH:
        text = this.getTextDutch();
        html = this.getHTMLDutch();
        subject = this.getSubjectDutch();
        break;
      case Language.ENGLISH:
        text = this.getTextEnglish();
        html = this.getHTMLEnglish();
        subject = this.getSubjectEnglish();
        break;
      default:
        throw new Error(`Unknown language: ${language}`);
    }

    return {
      ...this.baseMailOptions,
      text,
      html,
      subject,
    };
  }
}
