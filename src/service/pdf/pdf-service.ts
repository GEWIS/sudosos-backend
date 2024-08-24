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
import Pdf from '../../entity/file/pdf-file';
import {
  Client, FileResponse,
  FileSettings,
  IPayoutRouteParams,
  Language,
  ReturnFileType,
} from 'pdf-generator-client';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../database/database';
import FileService from '../file-service';
import { PdfError } from '../../errors';
import { IPdfAble, IUnstoredPdfAble } from '../../entity/file/pdf-able';

interface IRouteParams {
  params: any;
  settings: FileSettings;
}

export declare class RouteParams implements IRouteParams {
  params: any;

  settings: FileSettings;
  constructor(data?: IPayoutRouteParams);
  static fromJS(data: any): IRouteParams;
  toJSON(data?: any): any;
}


export abstract class BasePdfService<T, R extends RouteParams> {
  manager: EntityManager;

  public client: Client;

  abstract routeConstructor: new (data: IRouteParams) => R;

  stationary = 'BAC';

  static getClient(url: string) {
    return new Client(url, { fetch });
  }

  constructor(manager?: EntityManager) {
    const PDF_GEN_URL = process.env.PDF_GEN_URL ?? 'http://localhost:3001/pdf';
    this.manager = manager ?? AppDataSource.manager;
    this.client = BasePdfService.getClient(PDF_GEN_URL);
  }

  protected getFileSettings(fileType = ReturnFileType.PDF): FileSettings {
    return new FileSettings({
      createdAt: new Date(),
      fileType,
      language: Language.ENGLISH,
      name: '',
      stationery: this.stationary,
    });
  }

  public abstract getParameters(entity: T): Promise<any>;

  public abstract generator(routeParams: R): Promise<FileResponse>;

  public async getRouteParams(entity: T, fileType = ReturnFileType.PDF): Promise<R> {
    const params = await this.getParameters(entity);
    const settings = this.getFileSettings(fileType);
    return new this.routeConstructor({ params, settings });
  }

  public async createTex(entity: T): Promise<Buffer> {
    const routeParams = await this.getRouteParams(entity, ReturnFileType.TEX);

    try {
      const res = await this.generator(routeParams);
      const blob = res.data;
      return Buffer.from(await blob.arrayBuffer());
    } catch (res: any) {
      throw new PdfError(`Pdf generation failed: ${res.message}`);
    }
  }
}

export abstract class PdfService<S extends Pdf, T extends IPdfAble<S>, R extends RouteParams> extends BasePdfService<T, R> {

  fileService: FileService;

  abstract pdfConstructor: new () => S;

  constructor(fileLocation: string, manager?: EntityManager) {
    super(manager);
    this.fileService = new FileService(fileLocation);
  }

  public async createPdf(entity: T): Promise<S> {
    const routeParams = await this.getRouteParams(entity, ReturnFileType.PDF);
    const user = await entity.getOwner();

    try {
      const res = await this.generator(routeParams);
      const blob = res.data;
      const buffer = Buffer.from(await blob.arrayBuffer());
      return await this.fileService.uploadPdf<T, S>(entity, this.pdfConstructor, buffer, user);
    } catch (res: any) {
      throw new PdfError(`Pdf generation failed: ${res.message}`);
    }
  }
}

export abstract class UnstoredPdfService<T extends IUnstoredPdfAble, R extends RouteParams> extends BasePdfService<T, R> {

  public async createPdf(entity: T): Promise<Buffer> {
    const routeParams = await this.getRouteParams(entity);

    try {
      const res = await this.generator(routeParams);
      const blob = res.data;
      return Buffer.from(await blob.arrayBuffer());
    } catch (res: any) {
      throw new PdfError(`Pdf generation failed: ${res.message}`);
    }
  }
}
