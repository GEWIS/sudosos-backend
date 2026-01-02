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
 * This is the module page of the hello-world.
 *
 * @module internal/mailer
 */

import MailMessage, { Language, MailLanguageMap } from '../mail-message';
import MailContentBuilder from './mail-content-builder';

export interface HelloWorldOptions {
  name: string;
}

const helloWorldEnglish = new MailContentBuilder<HelloWorldOptions>({
  getHTML: (context) => `<p>Hello world, ${context.name}!</p>`,
  getText: (context) => `Hello world, ${context.name}!`,
  getSubject: 'Hello world!',
  getTitle: 'Hello world!',
});

const helloWorldDutch = new MailContentBuilder<HelloWorldOptions>({
  getHTML: (context) => `<p>Hallo wereld, ${context.name}!</p>`,
  getText: (context) => `Hallo wereld, ${context.name}!`,
  getSubject: 'Hallo wereld!',
  getTitle: 'Hallo wereld!',
});

const mailContents: MailLanguageMap<HelloWorldOptions> = {
  [Language.DUTCH]: helloWorldDutch,
  [Language.ENGLISH]: helloWorldEnglish,
};

export default class HelloWorld extends MailMessage<HelloWorldOptions> {
  public constructor(options: HelloWorldOptions) {
    super(options, mailContents);
  }
}
