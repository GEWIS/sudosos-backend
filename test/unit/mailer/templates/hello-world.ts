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
import { expect } from 'chai';
import HelloWorld from '../../../../src/mailer/templates/hello-world';
import { Language } from '../../../../src/mailer/templates/abstract-mail-template';

describe('HelloWorldTemplate', () => {
  it('should build correct email in English', () => {
    const name = 'Samuel';
    const template = new HelloWorld({ name });

    const options = template.getOptions(Language.ENGLISH);
    expect(options.text).to.contain(name);
    expect(options.html).to.contain(name);
    expect(options.subject).to.equal('Hello world!');
    expect(options.from).to.equal(process.env.SMTP_FROM);
  });
  it('should build correct email in Dutch', () => {
    const name = 'Samuel';
    const template = new HelloWorld({ name });

    const options = template.getOptions(Language.DUTCH);
    expect(options.text).to.contain(name);
    expect(options.html).to.contain(name);
    expect(options.subject).to.equal('Hallo wereld!');
    expect(options.from).to.equal(process.env.SMTP_FROM);
  });
  it('throw error if language does not exist', () => {
    const name = 'Samuel';
    const template = new HelloWorld({ name });

    const func = () => template.getOptions('binary' as any);
    expect(func).to.throw('Unknown language: binary');
  });
});
