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
import { TemplateOptions } from './notification-types';
import { Dinero } from 'dinero.js';
import { ResetTokenInfo } from '../service/authentication-service';
import { TransactionResponse } from '../controller/response/transaction-response';

/**
 * Options for notifying a user that they will receive a fine.
 */
export class UserWillGetFinedOptions extends TemplateOptions {
  constructor(
    public referenceDate: Date,
    public fine: Dinero,
    public balance: Dinero,
  ) {
    super();
  }
}

/**
 * Options for a notification when the user's PIN has been changed.
 */
export class ChangedPinOptions extends TemplateOptions {
}

/**
 * Options for notifying a user that they forgot an event they were planning.
 */
export class ForgotEventPlanningOptions extends TemplateOptions {
  /**
     * @param name - The user's name.
     * @param eventName - The name of the forgotten event.
     */
  constructor(
    public name: string,
    public eventName: string,
  ) {
    super();
  }
}

/**
 * Options for a simple "Hello World" notification.
 */
export class HelloWorldOptions extends TemplateOptions {
  /**
     * @param name - The user's name.
     */
  constructor(
    public name: string,
  ) {
    super();
  }
}


/**
 * Notification about administrative costs due to inactivity.
 */
export class InactiveAdministrativeCostNotificationOptions extends TemplateOptions {
  /**
     * @param administrativeCostValue - The administrative cost value as a formatted string.
     */
  constructor(
    public administrativeCostValue: string,
  ) {
    super();
  }
}

/**
 * Options for notifying a user that their membership is expiring.
 */
export class MembershipExpiryNotificationOptions extends TemplateOptions {
  /**
     * @param balance - The user's current balance.
     */
  constructor(
    public balance: Dinero,
  ) {
    super();
  }
}

/**
 * Welcome email with a password reset link.
 */
export class WelcomeWithResetOptions extends TemplateOptions {
  /**
     * @param email - The user's email address.
     * @param resetTokenInfo - Reset token information object.
     * @param url - Optional password reset URL.
     */
  constructor(
    public email: string,
    public resetTokenInfo: ResetTokenInfo,
    public url?: string,
  ) {
    super();
  }
}

/**
 * User type updated notification with a password reset link.
 */
export class UserTypeUpdatedWithResetOptions extends TemplateOptions {
  /**
   * @param email - The user's email address.
   * @param fromType - The old user type.
   * @param toType - The new user type.
   * @param url - Optional password reset URL.
   */
  constructor(
    public email: string,
    public fromType: string,
    public toType: string,
    public url?: string,
  ) {
    super();
  }
}

/**
 * User type updated notification.
 */
export class UserTypeUpdatedOptions extends TemplateOptions {
  /**
   * @param fromType - The old user type.
   * @param toType - The new user type.
   */
  constructor(
    public fromType: string,
    public toType: string,
  ) {
    super();
  }
}

/**
 * Notification about a user's debt.
 */
export class UserDebtNotificationOptions extends TemplateOptions {
  /**
     * @param url - URL to resolve or pay the debt.
     * @param balance - The current debt balance.
     */
  constructor(
    public url: string,
    public balance: Dinero,
  ) {
    super();
  }
}


/**
 * Options for notifying a user that they have received a fine.
 */
export class UserGotFinedOptions extends TemplateOptions {
  /**
     * @param referenceDate - The date the fine is based on.
     * @param fine - The fine amount.
     * @param totalFine - Total accumulated fine amount.
     * @param balance - The user's current balance after fines.
     */
  constructor(
    public referenceDate: Date,
    public fine: Dinero,
    public totalFine: Dinero,
    public balance: Dinero,
  ) {
    super();
  }
}


/**
 * Notification for inactive administrative cost charges.
 */
export class UserGotInactiveAdministrativeCostOptions extends TemplateOptions {
  /**
     * @param amount - The administrative cost amount.
     */
  constructor(
    public amount: Dinero,
  ) {
    super();
  }
}

/**
 * Welcome email for new Sudosos users.
 */
export class WelcomeToSudososOptions extends TemplateOptions {
  /**
     * @param url - Optional onboarding URL.
     */
  constructor(
    public url?: string,
  ) {
    super();
  }
}

// We make it a type to use Dinero itself for declarations
type DineroObject = Dinero.Dinero;

/**
 * Email to notify user about a just made transaction
 */
export class TransactionNotificationOptions extends TemplateOptions {
  constructor(
    public transaction: TransactionResponse,
    public balance: DineroObject,
  ) {
    super();
  }
}