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
 * CLI tool to simulate the physical actions on a Stripe Terminal reader.
 *
 * Because we have no physical reader, Stripe recommends developing against a
 * *simulated* reader (registration code `simulated-wpe`) and driving its
 * physical actions through the Test Helpers API. This tool exposes ONLY those
 * physical actions; the actual SudoSOS flow (creating a TerminalPayment,
 * sending it to the reader, cancelling, webhook handling, ...) is meant to be
 * exercised by you through the normal API endpoints so you can hit any edge
 * case you can think of.
 *
 * The simulated reader only talks to Stripe (test mode); no database
 * connection is needed or opened.
 *
 * Commands
 * --------
 *   list              List registered readers (to find IDs and their state).
 *   locations         List terminal locations and their IDs.
 *   register          Register a new simulated reader (test mode only).
 *   present           Present a payment method, i.e. tap/insert/swipe a card.
 *   succeed-input     Complete an on-screen input prompt on the reader.
 *   timeout-input     Let an on-screen input prompt time out.
 *   watch             Live-monitor a reader's state and send actions to it
 *                     interactively, in one session.
 *
 * Typical edge-case workflow
 * --------------------------
 *   1. Drive SudoSOS via the API to put a payment on the reader
 *      (POST /terminal-payments, then POST /terminal-payments/{id}/process).
 *   2. Simulate the customer action here, e.g.:
 *        pnpm stripe:terminal present --card 4242424242424242   # success
 *        pnpm stripe:terminal present --card 4000000000000002   # generic decline
 *   3. Inspect the resulting state / webhooks in SudoSOS.
 *
 * Tip: run `watch` in one terminal to see what the reader is doing in real
 * time while you drive SudoSOS and/or send actions — either by typing them
 * into the watch session, or from a second terminal with the standalone
 * commands below.
 *
 * Usage
 * -----
 *   pnpm stripe:terminal list
 *   pnpm stripe:terminal locations
 *   pnpm stripe:terminal register [--type <wpe|s700|s710>] [--location <locationId>] [--label <label>]
 *   pnpm stripe:terminal present [--terminal <readerId>] [--type <type>] [--card <number>] [--tip <amount>]
 *   pnpm stripe:terminal succeed-input [--terminal <readerId>] [--skip-non-required]
 *   pnpm stripe:terminal timeout-input [--terminal <readerId>]
 *   pnpm stripe:terminal watch [--terminal <readerId>] [--interval <ms>]
 */

import 'reflect-metadata';
import * as readline from 'readline';
import { program } from 'commander';
import log4js from 'log4js';
import Stripe from 'stripe';
import Config from '../src/config';
import { applyConfiguredLogLevel } from '../src/helpers/logging';
import { STRIPE_API_VERSION } from '../src/service/stripe-api-version';

const logger = log4js.getLogger('StripeTerminalCLI');
applyConfiguredLogLevel(logger);

// The Stripe SDK does not expose its Test Helpers param types on the public
// `Stripe.*` namespace, so derive them from the client method signatures.
type PresentPaymentMethodParams = NonNullable<
Parameters<Stripe['testHelpers']['terminal']['readers']['presentPaymentMethod']>[1]
>;
type SucceedInputCollectionParams = NonNullable<
Parameters<Stripe['testHelpers']['terminal']['readers']['succeedInputCollection']>[1]
>;

/**
 * Map a friendly reader type to the Stripe registration code that creates a
 * simulated reader of that type, so you can match the physical reader you
 * bought. These are the only simulated readers Stripe lets you register via
 * the API.
 * @see https://docs.stripe.com/terminal/payments/connect-reader
 */
const REGISTRATION_CODES: Record<string, string> = {
  wpe: 'simulated-wpe', // WisePOS E -> simulated_wisepos_e
  s700: 'simulated-s700', // Stripe Reader S700 -> simulated_stripe_s700
  s710: 'simulated-s710', // Stripe Reader S710 -> simulated_stripe_s710
};

/**
 * Create a Stripe client from the app config. Reads `STRIPE_PRIVATE_KEY` and
 * fails loudly when it is missing. Deliberately does not import the service
 * layer so the CLI stays lightweight and avoids booting the application.
 */
function stripeClient(): Stripe {
  const config = Config.get();
  if (!config.stripe.privateKey) {
    throw new Error('STRIPE_PRIVATE_KEY environment variable is not set.');
  }
  return new Stripe(config.stripe.privateKey, { apiVersion: STRIPE_API_VERSION });
}

/**
 * Resolve the reader ID to act on. When `--terminal` is omitted, fall back to
 * the single simulated reader if there is exactly one, otherwise refuse and
 * ask the user to be explicit (run `list` first).
 */
async function resolveReaderId(stripe: Stripe, explicit?: string): Promise<string> {
  if (explicit) return explicit;

  const readers = await stripe.terminal.readers.list({ limit: 100 });
  const simulated = readers.data.filter((r) => r.device_type.startsWith('simulated'));

  if (simulated.length === 1) {
    logger.info(`No --terminal given; defaulting to the only simulated reader: ${simulated[0].id}`);
    return simulated[0].id;
  }
  if (simulated.length === 0) {
    throw new Error('No simulated reader found. Register one first with: pnpm stripe:terminal register');
  }
  throw new Error(`Multiple simulated readers found (${simulated.map((r) => r.id).join(', ')}). Specify one with --terminal.`);
}

/**
 * Resolve the location ID a reader should be registered to. When `--location`
 * is omitted, default to the single location if there is exactly one,
 * otherwise refuse with guidance (run `locations` to see the options).
 */
async function resolveLocationId(stripe: Stripe, explicit?: string): Promise<string> {
  if (explicit) return explicit;

  const locations = await stripe.terminal.locations.list({ limit: 100 });

  if (locations.data.length === 1) {
    logger.info(`No --location given; defaulting to the only location: ${locations.data[0].id}`);
    return locations.data[0].id;
  }
  if (locations.data.length === 0) {
    throw new Error('No Stripe locations exist. Create one (Stripe dashboard → Terminal → Locations, or via the API) before registering a reader.');
  }
  throw new Error('Multiple locations found. Specify one with --location. List them with: pnpm stripe:terminal locations');
}

/**
 * Produce a compact, single-line description of a terminal location.
 */
function describeLocation(location: Stripe.Terminal.Location): string {
  const a = location.address;
  const addr = [a?.line1, a?.postal_code, a?.city, a?.country].filter(Boolean).join(', ');
  return `${location.id}  "${location.display_name}"${addr ? `  (${addr})` : ''}`;
}

/**
 * Produce a compact, single-line description of a reader's current state: its
 * networking status and the action it is performing (with the linked payment
 * intent and any failure details). Used both for one-off command output and
 * for the live `watch` view.
 */
function describeReader(reader: Stripe.Terminal.Reader): string {
  const action = reader.action;
  if (!action) return `status=${reader.status ?? 'unknown'} action=idle`;

  const parts = [`status=${reader.status ?? 'unknown'}`, `action=${action.type}/${action.status}`];

  const ppi = action.process_payment_intent?.payment_intent;
  if (ppi) parts.push(`paymentIntent=${typeof ppi === 'string' ? ppi : ppi.id}`);

  if (action.failure_code) {
    parts.push(`failure=${action.failure_code} (${action.failure_message ?? 'no message'})`);
  }

  return parts.join('  ');
}

/* -------------------------------------------------------------------------- */
/* Physical actions (shared by the standalone commands and the watch session) */
/* -------------------------------------------------------------------------- */

/**
 * Present a payment method on the reader: the customer taps, inserts or swipes
 * a card. The reader must already have a payment in progress (i.e. SudoSOS has
 * called processPaymentIntent on it), otherwise Stripe returns an error —
 * which is itself a useful edge case to test.
 */
async function actionPresent(
  stripe: Stripe, readerId: string, opts: { type?: string; card?: string; tip?: string },
): Promise<Stripe.Terminal.Reader> {
  const type = (opts.type ?? 'card_present') as PresentPaymentMethodParams['type'];
  const params: PresentPaymentMethodParams = { type };

  if (opts.tip) params.amount_tip = parseInt(opts.tip, 10);

  // The simulated reader accepts a test card number to drive success/decline
  // behaviour. When omitted, Stripe uses its default test card (a success).
  if (opts.card) {
    if (type === 'interac_present') {
      params.interac_present = { number: opts.card };
    } else {
      params.card_present = { number: opts.card };
    }
  }

  return stripe.testHelpers.terminal.readers.presentPaymentMethod(readerId, params);
}

/**
 * Complete an on-screen input prompt on the reader (e.g. the customer confirms
 * a tip or selects an option).
 */
async function actionSucceedInput(
  stripe: Stripe, readerId: string, opts: { skipNonRequired?: boolean },
): Promise<Stripe.Terminal.Reader> {
  const params: SucceedInputCollectionParams = {};
  if (opts.skipNonRequired) params.skip_non_required_inputs = 'all';
  return stripe.testHelpers.terminal.readers.succeedInputCollection(readerId, params);
}

/**
 * Let an on-screen input prompt time out (the customer ignores / walks away).
 */
async function actionTimeoutInput(stripe: Stripe, readerId: string): Promise<Stripe.Terminal.Reader> {
  return stripe.testHelpers.terminal.readers.timeoutInputCollection(readerId);
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * List all readers registered in Stripe along with their current action state.
 */
async function commandList() {
  const stripe = stripeClient();
  const readers = await stripe.terminal.readers.list({ limit: 100 });

  if (readers.data.length === 0) {
    logger.info('No terminal readers found.');
    return;
  }

  logger.info(`Found ${readers.data.length} reader(s):`);
  for (const r of readers.data) {
    logger.info(`  ${r.id}  "${r.label}"  [${r.device_type}]  ${describeReader(r)}`);
  }
}

/**
 * List all terminal locations registered in Stripe with their IDs, so a
 * location can be picked when registering a reader.
 */
async function commandLocations() {
  const stripe = stripeClient();
  const locations = await stripe.terminal.locations.list({ limit: 100 });

  if (locations.data.length === 0) {
    logger.info('No locations found. Create one (Stripe dashboard → Terminal → Locations, or via the API) before registering a reader.');
    return;
  }

  logger.info(`Found ${locations.data.length} location(s):`);
  for (const l of locations.data) {
    logger.info(`  ${describeLocation(l)}`);
  }
}

/**
 * Register a new simulated reader (Stripe test mode only). This mimics the
 * physical act of connecting a reader to your account. Pick `--type` to match
 * the physical reader you bought. A reader must belong to a location; when
 * `--location` is omitted we default to the only one (run the `locations`
 * command to see the available IDs).
 */
async function commandRegister(options: { location?: string; label?: string; type?: string }) {
  const stripe = stripeClient();

  const typeKey = (options.type ?? 'wpe').toLowerCase();
  const registrationCode = REGISTRATION_CODES[typeKey];
  if (!registrationCode) {
    throw new Error(`Unknown reader type "${options.type}". Valid types: ${Object.keys(REGISTRATION_CODES).join(', ')}.`);
  }

  const location = await resolveLocationId(stripe, options.location);

  const reader = await stripe.terminal.readers.create({
    registration_code: registrationCode,
    label: options.label ?? 'SudoSOS CLI simulated reader',
    location,
  });
  logger.info(`Registered simulated reader: ${reader.id}  "${reader.label}"  [${reader.device_type}]  location=${location}`);
}

async function commandPresent(options: { terminal?: string; type?: string; card?: string; tip?: string }) {
  const stripe = stripeClient();
  const readerId = await resolveReaderId(stripe, options.terminal);
  const reader = await actionPresent(stripe, readerId, options);
  logger.info(`Presented ${options.type ?? 'card_present'}${options.card ? ` (card ${options.card})` : ''} on ${readerId}.`);
  logger.info(`  ${describeReader(reader)}`);
}

async function commandSucceedInput(options: { terminal?: string; skipNonRequired?: boolean }) {
  const stripe = stripeClient();
  const readerId = await resolveReaderId(stripe, options.terminal);
  const reader = await actionSucceedInput(stripe, readerId, options);
  logger.info(`Succeeded input collection on ${readerId}.`);
  logger.info(`  ${describeReader(reader)}`);
}

async function commandTimeoutInput(options: { terminal?: string }) {
  const stripe = stripeClient();
  const readerId = await resolveReaderId(stripe, options.terminal);
  const reader = await actionTimeoutInput(stripe, readerId);
  logger.info(`Timed out input collection on ${readerId}.`);
  logger.info(`  ${describeReader(reader)}`);
}

/**
 * Live-monitor a reader and send physical actions to it interactively.
 *
 * Polls the reader on an interval (Stripe has no push channel for reader
 * state) and prints a line whenever the state changes, so you can see what the
 * terminal *should* be doing while you drive SudoSOS. The same session accepts
 * typed commands (present/succeed/timeout/cancel/state) so you can both watch
 * and act from one place.
 */
async function commandWatch(options: { terminal?: string; interval?: string }) {
  const stripe = stripeClient();
  const readerId = await resolveReaderId(stripe, options.terminal);
  const intervalMs = options.interval ? parseInt(options.interval, 10) : 1000;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'terminal> ',
  });

  // Print a line above the prompt without garbling whatever the user is typing.
  const emit = (line: string) => {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(`${line}\n`);
    rl.prompt(true);
  };

  let lastState: string | null = null;
  let polling = false;

  // Retrieve the reader and emit a line only when its state changed.
  const poll = async (force = false) => {
    if (polling) return;
    polling = true;
    try {
      // retrieve() is typed as Reader | DeletedReader; narrow via the
      // `deleted` flag that only the deleted variant carries.
      const result = await stripe.terminal.readers.retrieve(readerId);
      if ((result as Stripe.Terminal.DeletedReader).deleted) {
        emit(`Reader ${readerId} has been deleted; stopping.`);
        rl.close();
        return;
      }
      const state = describeReader(result as Stripe.Terminal.Reader);
      if (force || state !== lastState) {
        lastState = state;
        emit(`[${new Date().toISOString()}] ${state}`);
      }
    } catch (e) {
      emit(`[poll error] ${e instanceof Error ? e.message : e}`);
    } finally {
      polling = false;
    }
  };

  const printHelp = () => {
    emit([
      'Commands:',
      '  present [card]       Tap/insert a card (optional test card number, e.g. 4000000000000002 to decline)',
      '  succeed              Complete an on-screen input prompt',
      '  timeout              Let an on-screen input prompt time out',
      '  cancel               Cancel the reader\'s current action (Stripe API cancelAction)',
      '  state                Force-print the current reader state now',
      '  help                 Show this help',
      '  quit / exit          Stop watching and exit',
    ].join('\n'));
  };

  // Handle a typed command, then refresh the displayed state.
  const handle = async (input: string) => {
    const [cmd, ...rest] = input.trim().split(/\s+/);
    try {
      switch (cmd) {
        case '':
          break;
        case 'present':
          await actionPresent(stripe, readerId, { card: rest[0] });
          break;
        case 'succeed':
        case 'succeed-input':
          await actionSucceedInput(stripe, readerId, {});
          break;
        case 'timeout':
        case 'timeout-input':
          await actionTimeoutInput(stripe, readerId);
          break;
        case 'cancel':
          await stripe.terminal.readers.cancelAction(readerId);
          break;
        case 'state':
        case 'refresh':
          await poll(true);
          return;
        case 'help':
        case '?':
          printHelp();
          return;
        case 'quit':
        case 'exit':
          rl.close();
          return;
        default:
          emit(`Unknown command "${cmd}". Type "help" for the list of commands.`);
          return;
      }
      // Reflect the result of the action immediately.
      await poll(true);
    } catch (e) {
      emit(`[error] ${e instanceof Error ? e.message : e}`);
    }
  };

  logger.info(`Watching reader ${readerId} (polling every ${intervalMs}ms). Type "help" for commands, "quit" to stop.`);
  await poll(true);

  const timer = setInterval(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    poll();
  }, intervalMs);

  rl.on('line', (line) => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    handle(line).then(() => rl.prompt());
  });

  rl.prompt();

  // Keep the process alive until the readline interface is closed.
  await new Promise<void>((resolve) => {
    rl.on('close', () => {
      clearInterval(timer);
      logger.info('Stopped watching.');
      resolve();
    });
  });
}

/* -------------------------------------------------------------------------- */
/* CLI wiring                                                                 */
/* -------------------------------------------------------------------------- */

function run(fn: () => Promise<void>) {
  return async () => {
    try {
      await fn();
      process.exit(0);
    } catch (e) {
      logger.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  };
}

program
  .name('stripe-terminal')
  .description('Simulate physical actions on a Stripe Terminal reader (test mode)');

program
  .command('list')
  .description('List registered readers with their current action state')
  .action(run(() => commandList()));

program
  .command('locations')
  .description('List terminal locations and their IDs')
  .action(run(() => commandLocations()));

program
  .command('register')
  .description('Register a new simulated reader (Stripe test mode only)')
  .option('--type <type>', `Reader type to simulate: ${Object.keys(REGISTRATION_CODES).join(' | ')} (match the physical reader you bought)`, 'wpe')
  .option('--location <locationId>', 'Stripe location ID to assign the reader to')
  .option('--label <label>', 'Human-readable label for the reader')
  .action((options) => run(() => commandRegister(options))());

program
  .command('present')
  .description('Present a payment method (tap/insert/swipe a card)')
  .option('--terminal <readerId>', 'Reader ID (defaults to the only simulated reader)')
  .option('--type <type>', 'Payment method type: card_present | interac_present | card', 'card_present')
  .option('--card <number>', 'Test card number; success (4242…4242) or decline (4000…0002). Defaults to Stripe success card.')
  .option('--tip <amount>', 'Optional tip amount in the smallest currency unit (e.g. cents)')
  .action((options) => run(() => commandPresent(options))());

program
  .command('succeed-input')
  .description('Complete an on-screen input prompt on the reader')
  .option('--terminal <readerId>', 'Reader ID (defaults to the only simulated reader)')
  .option('--skip-non-required', 'Skip all non-required inputs instead of filling them')
  .action((options) => run(() => commandSucceedInput(options))());

program
  .command('timeout-input')
  .description('Let an on-screen input prompt time out (customer ignores the reader)')
  .option('--terminal <readerId>', 'Reader ID (defaults to the only simulated reader)')
  .action((options) => run(() => commandTimeoutInput(options))());

program
  .command('watch')
  .description('Live-monitor a reader and send actions to it interactively')
  .option('--terminal <readerId>', 'Reader ID (defaults to the only simulated reader)')
  .option('--interval <ms>', 'Polling interval in milliseconds', '1000')
  .action((options) => run(() => commandWatch(options))());

program.parse(process.argv);
