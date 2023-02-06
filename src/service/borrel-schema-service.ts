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
import { FindManyOptions } from 'typeorm';
import {
  BorrelSchemaResponse,
  BorrelSchemaAnswerResponse,
  BorrelSchemaShiftResponse,
} from '../controller/response/borrel-schema-response';
import {
  UpdateBorrelSchema,
  CreateBorrelSchemaParams,
  CreateBorrelSchemaShiftRequest,
  CreateBorrelSchemaAnswerRequest,
  UpdateBorrelSchemaShift,
  UpdateBorrelSchemaAnswerAvailability,
  SelectBorrelSchemaAnswer,
} from '../controller/request/borrel-schema-request';
import BorrelSchema from '../entity/borrel-schema/borrel-schema';
import BorrelSchemaShift from '../entity/borrel-schema/borrel-schema-shift';
import BorrelSchemaAnswer from '../entity/borrel-schema/borrel-schema-answer';
import User from '../entity/user/user';
import { parseUserToResponse } from '../helpers/revision-to-response';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import { RequestWithToken } from '../middleware/token-middleware';
import {
  asDate, asNumber,
} from '../helpers/validators';

export interface BorrelSchemaFilterParameters {
  name?: string;
  borrelSchemaId?: number;
  createById?: number;
  startDate?: Date;
  endDate?: Date;
  shiftId?: number;
}
export interface BorrelSchemaShiftFilterParameters {
  name?: string;
  default?: boolean;
}

export interface BorrelSchemaAnswerFilterParameters {
  userId?: number;
  availability?: number;
  selected?: boolean;
  shiftId?: number;
  borrelSchemaId?: number;
}

export function parseBorrelSchemaFilterParameters(
  req: RequestWithToken,
): BorrelSchemaFilterParameters {
  return {
    name: String(req.query.name),
    borrelSchemaId: asNumber(req.query.borrelSchemaId),
    createById: asNumber(req.query.createById),
    startDate: asDate(req.query.startDate),
    endDate: asDate(req.query.endDate),
    shiftId: asNumber(req.query.shiftId),
  };
}

/**
 * Wrapper for all Borrel-schema related logic.
 */
export default class BorrelSchemaService {
  private static asBorrelSchemaResponse(entity: BorrelSchema): BorrelSchemaResponse {
    return {
      createdAt: entity.createdAt.toISOString(),
      createdBy: parseUserToResponse(entity.createdBy, false),
      endDate: entity.endDate.toISOString(),
      id: entity.id,
      name: entity.name,
      shifts: [],
      startDate: entity.startDate.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  private static asBorrelSchemaShiftResponse(entity: BorrelSchemaShift):
  BorrelSchemaShiftResponse {
    return {
      default: entity.default,
      createdAt: entity.createdAt.toISOString(),
      id: entity.id,
      name: entity.name,
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  private static asBorrelSchemaAnswerResponse(entity: BorrelSchemaAnswer):
  BorrelSchemaAnswerResponse {
    return {
      availability: entity.availability,
      borrelSchema: this.asBorrelSchemaResponse(entity.borrelSchema),
      selected: entity.selected,
      shift: this.asBorrelSchemaShiftResponse(entity.shift),
      user: parseUserToResponse(entity.user, false),
    };
  }

  /**
   * Get all borrel schemas.
   */
  public static async getBorrelSchemas(params: BorrelSchemaFilterParameters = {})
    :Promise<BorrelSchemaResponse[]> {
    const filterMapping: FilterMapping = {
      name: 'name',
      startDate: 'startDate',
      borrelSchemaId: 'id',
    };

    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
      relations: ['createdBy', 'shifts'],
      order: { startDate: 'ASC' },
    };

    options.relations.push('borrelSchemaShifts');
    const borrelSchemas = await BorrelSchema.find({ ...options });
    const records: BorrelSchemaResponse[] = borrelSchemas.map(
      this.asBorrelSchemaResponse.bind(this),
    );

    return records;
  }

  /**
     * Create borrel schema.
     */
  public static async createBorrelSchema(borrelSchemaRequest: CreateBorrelSchemaParams)
    : Promise<BorrelSchemaResponse> {
    // Create a new Borrel-schema
    const createdBy = await User.findOne({ where: { id: borrelSchemaRequest.createdById } });
    const shifts = await Promise.all(borrelSchemaRequest.shiftIds.map(async (shiftId) => {
      const shift = await BorrelSchemaShift.findOne({ where: { id: shiftId } });
      return shift;
    }));
    const newBorrelSchema: BorrelSchema = Object.assign(new BorrelSchema(), {
      name: borrelSchemaRequest.name,
      createdBy,
      startDate: new Date(borrelSchemaRequest.startDate),
      endDate: new Date(borrelSchemaRequest.endDate),
      shifts,
    });
    // First save the Borrel-schema.
    await BorrelSchema.save(newBorrelSchema);
    return this.asBorrelSchemaResponse(newBorrelSchema);
  }

  /**
   * Update borrel schema.
   */
  public static async updateBorrelSchema(id: number, update: UpdateBorrelSchema) {
    // Update a Borrel-schema.
    const borrelSchema = await BorrelSchema.findOne({ where: { id } });
    if (!borrelSchema) return undefined;
    borrelSchema.name = update.name;
    borrelSchema.startDate = new Date(update.startDate);
    borrelSchema.endDate = new Date(update.endDate);
    borrelSchema.shifts = await Promise.all(update.shifts.map(async (shiftId) => {
      const shift = await BorrelSchemaShift.findOne({ where: { id: shiftId } });
      return shift;
    }));
    await BorrelSchema.save(borrelSchema);
    return this.asBorrelSchemaResponse(borrelSchema);
  }

  /**
   * Delete borrel schema.
   */
  public static async deleteBorrelSchema(id: number): Promise<void> {
    // check if banner in database
    const borrelSchema = await BorrelSchema.findOne({ where: { id } });

    // return undefined if not found
    if (!borrelSchema) {
      return;
    }
    await BorrelSchema.delete(borrelSchema);
  }

  /**
   * Create borrel schema shift.
   */
  public static async createBorrelSchemaShift(borrelSchemaShiftRequest
  : CreateBorrelSchemaShiftRequest): Promise<BorrelSchemaShiftResponse> {
  // Create a new Borrel-schema-shift
    const newBorrelSchemaShift: BorrelSchemaShift = Object.assign(new BorrelSchemaShift(), {
      name: borrelSchemaShiftRequest.name,
      default: borrelSchemaShiftRequest.default,
    });
    await BorrelSchemaShift.save(newBorrelSchemaShift);
    return this.asBorrelSchemaShiftResponse(newBorrelSchemaShift);
  }

  /**
   * Update borrel schema shift.
   */
  public static async updateBorrelSchemaShift(id: number, update: UpdateBorrelSchemaShift) {
    const shift = await BorrelSchemaShift.findOne({ where: { id } });
    if (!shift) return undefined;
    shift.name = update.name;
    shift.default = update.default;
    await BorrelSchemaShift.save(shift);
    return this.asBorrelSchemaShiftResponse(shift);
  }

  /**
   * Create borrel schema answer.
   */
  public static async createBorrelSchemaAnswer(borrelSchemaAnswerRequest
  : CreateBorrelSchemaAnswerRequest): Promise<BorrelSchemaAnswerResponse> {
    // Create a new Borrel-schema-answer
    const user = await User.findOne({ where: { id: borrelSchemaAnswerRequest.userId } });
    const shift = await BorrelSchemaShift.findOne({
      where:
          { id: borrelSchemaAnswerRequest.shiftId },
    });
    const borrelSchema = await BorrelSchema.findOne({
      where:
          { id: borrelSchemaAnswerRequest.borrelSchemaId },
    });
    const newBorrelSchemaAnswer: BorrelSchemaAnswer = Object.assign(new BorrelSchemaAnswer(), {
      user,
      availability: borrelSchemaAnswerRequest.availability,
      selected: borrelSchemaAnswerRequest.selected,
      shift,
      borrelSchema,
    });
    await BorrelSchemaAnswer.save(newBorrelSchemaAnswer);
    return this.asBorrelSchemaAnswerResponse(newBorrelSchemaAnswer);
  }

  /**
   * Update borrel schema answer availability.
   */
  public static async updateBorrelSchemaAnswerAvailability(
    id: number, update: UpdateBorrelSchemaAnswerAvailability,
  ) {
    const answer = await BorrelSchemaAnswer.findOne({ where: { id } });
    if (!answer) return undefined;
    answer.availability = update.availability;
    await BorrelSchemaAnswer.save(answer);
    return this.asBorrelSchemaAnswerResponse(answer);
  }

  /**
   * Update borrel schema answer selection.
   */
  public static async selectBorrelSchemaAnswer(
    id: number, update: SelectBorrelSchemaAnswer,
  ) {
    const answer = await BorrelSchemaAnswer.findOne({ where: { id } });
    if (!answer) return undefined;
    answer.selected = update.selected;
    await BorrelSchemaAnswer.save(answer);
    return this.asBorrelSchemaAnswerResponse(answer);
  }

  /**
   * Delete borrel schema answer.
   */
  public static async deleteBorrelSchemaParticipantAnswers(
    borrelSchemaId: number, participantId: number,
  ) {
    const borrelSchema = await BorrelSchema.findOne({ where: { id: borrelSchemaId } });
    const participant = await User.findOne({ where: { id: participantId } });
    const answers = await BorrelSchemaAnswer.find({ where: { borrelSchema, user: participant } });
    const answerIds = answers.map((answer) => answer.id);
    await BorrelSchemaAnswer.delete(answerIds);
  }
}
