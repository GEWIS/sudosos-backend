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

import dinero from 'dinero.js';

const TYPE_KEY = '__sudososTaskValue';

interface DineroLike {
  getAmount(): number;
  toObject(): {
    amount: number;
    currency: string;
    precision: number;
  };
}

function isDineroLike(value: unknown): value is DineroLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DineroLike>;
  return typeof candidate.getAmount === 'function'
    && typeof candidate.toObject === 'function';
}

function taskPayloadReplacer(
  this: Record<string, unknown>,
  key: string,
  value: unknown,
): unknown {
  const original = key === '' ? value : this[key];
  if (original instanceof Date) {
    return { [TYPE_KEY]: 'date', value: original.toISOString() };
  }
  if (isDineroLike(original)) {
    return { [TYPE_KEY]: 'dinero', value: original.toObject() };
  }
  return value;
}

function taskPayloadReviver(_key: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !(TYPE_KEY in value)) {
    return value;
  }

  const tagged = value as {
    [TYPE_KEY]: string;
    value: unknown;
  };
  if (tagged[TYPE_KEY] === 'date' && typeof tagged.value === 'string') {
    return new Date(tagged.value);
  }
  if (tagged[TYPE_KEY] === 'dinero') {
    return dinero(tagged.value as Dinero.Options);
  }
  return value;
}

export function serializeTaskPayload(payload: unknown): string {
  return JSON.stringify(payload, taskPayloadReplacer);
}

export function deserializeTaskPayload(payload: string): unknown {
  return JSON.parse(payload, taskPayloadReviver);
}
