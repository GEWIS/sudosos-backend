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
 * This is the module page of the terminal payment relation helper.
 *
 * @module websocket
 */

/**
 * Determine the RBAC relation between a user and a single TerminalPayment.
 *
 * Deliberately avoids TerminalPaymentService: that reaches TransactionService,
 * which imports WebSocketService, so importing it from the websocket layer
 * would close a require cycle.
 *
 * The TerminalPayment entity is loaded with a dynamic import rather than a
 * top-level one for a second, separate reason. Its subtree contains a mutual
 * import between `tmp-sub-transaction` and `tmp-sub-transaction-row`, and
 * pulling that subtree in from here changes module initialisation order enough
 * that `TmpSubTransactionRow` ends up extending an undefined
 * `SubTransactionRow`. Resolving at call time sidesteps the ordering entirely,
 * by which point every entity is loaded. The underlying entity cycle is worth
 * fixing on its own.
 *
 * Only the relations needed for the check are loaded, which is a leaner query
 * than the full graph `TerminalPaymentService.getTerminalPayment` builds.
 * @param userId - ID of the user subscribing.
 * @param terminalPaymentId - ID of the terminal payment being subscribed to.
 * @returns `own` when the user is connected to the payment, `all` otherwise
 * (including when it does not exist).
 */
export async function getTerminalPaymentRelation(
  userId: number,
  terminalPaymentId: number,
): Promise<'all' | 'own'> {
  const { default: TerminalPayment } = await import('../../entity/transactions/terminal/terminal-payment');

  const terminalPayment = await TerminalPayment.findOne({
    where: { id: terminalPaymentId },
    relations: {
      createdBy: true,
      temporaryTransaction: { from: true, createdBy: true },
      finalTransaction: { from: true, createdBy: true },
    },
  });
  if (!terminalPayment) return 'all';

  return terminalPayment.isRelatedToUser(userId) ? 'own' : 'all';
}
