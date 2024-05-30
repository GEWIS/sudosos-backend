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

import MailTemplate, { Language, MailLanguageMap } from './mail-template';
import MailContent from './mail-content';

export interface ForgotEventPlanningOptions {
  name: string;
  eventName: string;
}

const forgotEventPlanningEnglish = new MailContent<ForgotEventPlanningOptions>({
  getHTML: (context) => `<p>Dear ${context.name},</p>
<p>What is this? Have you not yet filled in the borrel planning for ${context.eventName}? Shame on you!<br>
Go quickly to SudoSOS to fix your mistakes!</p>

<p>Hugs,<br>
The SudoSOS borrel planning robot</p>`,
  getText: (context) => `Dear ${context.name},

What is this? Have you not yet filled in the borrel planning for ${context.eventName}? Shame on you!
Go quickly to SudoSOS to fix your mistakes!

Hugs,
The SudoSOS borrel planning robot`,
  getSubject: ({ eventName }) => `Borrel planning ${eventName}`,
});

const forgotEventPlanningDutch = new MailContent<ForgotEventPlanningOptions>({
  getHTML: (context) => `<p>Beste ${context.name},</p>
<p>Wat is dit nou? Heb je het borrelrooster voor ${context.eventName} nog niet ingevuld? Foei!<br>
Ga snel naar SudoSOS om je fouten recht te zetten!</p>

<p>Kusjes,<br>
De SudoSOS borrelrooster invulrobot</p>`,
  getText: (context) => `Beste ${context.name},

Wat is dit nou? Heb je het borrelrooster voor ${context.eventName} nog niet ingevuld? Foei!
Ga snel naar SudoSOS om je fouten recht te zetten!

Kusjes,
De SudoSOS borrelrooster invulrobot`,
  getSubject: ({ eventName }) => `Borrelrooster ${eventName}`,
});

const mailContents: MailLanguageMap<ForgotEventPlanningOptions> = {
  [Language.DUTCH]: forgotEventPlanningDutch,
  [Language.ENGLISH]: forgotEventPlanningEnglish,
};

export default class ForgotEventPlanning extends MailTemplate<ForgotEventPlanningOptions> {
  public constructor(options: ForgotEventPlanningOptions) {
    super(options, mailContents);
  }
}
