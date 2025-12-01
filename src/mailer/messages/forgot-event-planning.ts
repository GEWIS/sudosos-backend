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
 *
 *  @license
 */

/**
 * This is the module page of the forgot-event-planning.
 *
 * @module internal/mailer
 */

import MailMessage, { Language, MailLanguageMap } from '../mail-message';
import MailContentBuilder from './mail-content-builder';
import { ForgotEventPlanningOptions } from '../../notifications';

const forgotEventPlanningEnglish = new MailContentBuilder<ForgotEventPlanningOptions>({
  getHTML: (context) => `<p>What is this? Have you not yet filled in the borrel planning for ${context.eventName}? Shame on you!<br>
Go quickly to SudoSOS to fix your mistakes!</p>

<p>Hugs,<br>
The SudoSOS borrel planning robot</p>`,
  getText: (context) => `What is this? Have you not yet filled in the borrel planning for ${context.eventName}? Shame on you!
Go quickly to SudoSOS to fix your mistakes!

Hugs,
The SudoSOS borrel planning robot`,
  getSubject: ({ eventName }) => `Borrel planning ${eventName}`,
  getTitle: 'Planningnotificatie',
});

const forgotEventPlanningDutch = new MailContentBuilder<ForgotEventPlanningOptions>({
  getHTML: (context) => `<p>Wat is dit nou? Heb je het borrelrooster voor ${context.eventName} nog niet ingevuld? Foei!<br>
Ga snel naar SudoSOS om je fouten recht te zetten!</p>

<p>Kusjes,<br>
De SudoSOS borrelrooster invulrobot</p>`,
  getText: (context) => `Wat is dit nou? Heb je het borrelrooster voor ${context.eventName} nog niet ingevuld? Foei!
Ga snel naar SudoSOS om je fouten recht te zetten!

Kusjes,
De SudoSOS borrelrooster invulrobot`,
  getSubject: ({ eventName }) => `Borrelrooster ${eventName}`,
  getTitle: 'Planning notification',
});

const mailContents: MailLanguageMap<ForgotEventPlanningOptions> = {
  [Language.DUTCH]: forgotEventPlanningDutch,
  [Language.ENGLISH]: forgotEventPlanningEnglish,
};

/**
 * @deprecated Events are out of scope for SudoSOS. Delete from 01/11/2026.
 */
export default class ForgotEventPlanning extends MailMessage<ForgotEventPlanningOptions> {
  public constructor(options: ForgotEventPlanningOptions) {
    super(options, mailContents);
  }
}
