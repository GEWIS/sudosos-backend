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
 * This is the page of pdf-service.
 *
 * @module internal/pdf
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
import FileService from '../file-service';
import { PdfError } from '../../errors';
import { IPdfAble, IUnstoredPdfAble } from '../../entity/file/pdf-able';
import WithManager from '../../database/with-manager';
import PdfTemplateGenerator from './pdf-template-generator';
import { postCompileHtml } from '@gewis/pdf-compiler-ts';
import { createClient, type Client as PdfCompilerClient } from '@gewis/pdf-compiler-ts/dist/client/client';

/**
 * Base interface for all PDF services (both LaTeX and HTML-based).
 * This allows entities to use either approach interchangeably.
 */
export interface IPdfServiceBase<T> {
  createPdf(entity: T): Promise<Buffer | Pdf>;
  createRaw(entity: T): Promise<Buffer>;
  getParameters(entity: T): Promise<any>;
}

/**
 * Type alias for template parameters used in HTML PDF services.
 * Parameters must be a record (object) with string keys.
 */
export type PdfTemplateParameters = Record<string, any>;

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


export abstract class BasePdfService<T, R extends RouteParams> extends WithManager implements IPdfServiceBase<T> {
  public client: Client;

  abstract routeConstructor: new (data: IRouteParams) => R;

  stationary = 'BAC';

  static getClient(url: string) {
    return new Client(url, { fetch });
  }

  constructor(manager?: EntityManager) {
    super(manager);
    const PDF_GEN_URL = process.env.PDF_GEN_URL ?? 'http://localhost:3001/pdf';
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

  public abstract createPdf(entity: T): Promise<Buffer | Pdf>;

  public async getRouteParams(entity: T, fileType = ReturnFileType.PDF): Promise<R> {
    const params = await this.getParameters(entity);
    const settings = this.getFileSettings(fileType);
    return new this.routeConstructor({ params, settings });
  }

  public async createRaw(entity: T): Promise<Buffer> {
    const routeParams = await this.getRouteParams(entity, ReturnFileType.TEX);

    try {
      const res = await this.generator(routeParams);
      const blob = res.data;
      return Buffer.from(await blob.arrayBuffer());
    } catch (res: any) {
      throw new PdfError(`Pdf generation failed: ${res.message}`);
    }
  }

  /**
   * @deprecated Use createRaw() instead
   */
  public async createTex(entity: T): Promise<Buffer> {
    return this.createRaw(entity);
  }
}

/**
 * Base class for HTML-to-PDF services.
 * Uses POST /compile-html endpoint to generate PDFs from HTML templates.
 * Templates are stored in static/pdf/ and use {{ key }} placeholders.
 * 
 * @template T - The entity type
 * @template P - The template parameters type (must extend PdfTemplateParameters)
 */
export abstract class BaseHtmlPdfService<T, P extends PdfTemplateParameters = PdfTemplateParameters> extends WithManager implements IPdfServiceBase<T> {
  protected htmlPdfGenUrl: string;

  protected client: PdfCompilerClient;

  /**
   * The template file name (e.g., 'invoice.html') located in static/pdf/
   * The template should use {{ key }} placeholders that will be replaced with data from getParameters().
   */
  abstract templateFileName: string;

  constructor(manager?: EntityManager) {
    super(manager);
    this.htmlPdfGenUrl = process.env.HTML_PDF_GEN_URL ?? 'http://localhost:3001';
    // Create a client instance per service instance to avoid race conditions
    this.client = createClient({ baseUrl: this.htmlPdfGenUrl });
  }

  /**
   * Get the data object to use with the HTML template.
   * The keys in this object will replace {{ key }} placeholders in the template.
   * 
   * @param entity - The entity to extract parameters from
   * @returns A promise resolving to the template parameters object
   */
  public abstract getParameters(entity: T): Promise<P>;

  /**
   * Apply parameters to the template and return the complete HTML.
   */
  protected async getHtml(entity: T): Promise<string> {
    const data = await this.getParameters(entity);
    return PdfTemplateGenerator.applyTemplate(this.templateFileName, data);
  }

  /**
   * Compile HTML to PDF using the external service.
   * Sends the complete HTML body to the /compile-html endpoint.
   */
  protected async compileHtml(html: string): Promise<Buffer> {
    try {
      const data = await postCompileHtml<true>({
        client: this.client,
        body: { html },
        parseAs: 'stream',
      });

      if (data.response.status !== 200) {
        const errorText = await data.response.text().catch(() => 'Unknown error');
        throw new PdfError(`HTML PDF generation failed: ${data.response.status} ${errorText}`);
      }

      const arrayBuffer = await data.response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      if (error instanceof PdfError) {
        throw error;
      }
      throw new PdfError(`HTML PDF generation failed: ${error.message}`);
    }
  }

  /**
   * Create a PDF from the HTML template.
   */
  public async createPdf(entity: T): Promise<Buffer | Pdf> {
    const html = await this.getHtml(entity);
    return this.compileHtml(html);
  }

  /**
   * Create raw HTML output (for debugging/preview).
   */
  public async createRaw(entity: T): Promise<Buffer> {
    const html = await this.getHtml(entity);
    return Buffer.from(html, 'utf-8');
  }
}

export abstract class PdfService<S extends Pdf, T extends IPdfAble<S>, R extends RouteParams> extends BasePdfService<T, R> implements IPdfServiceBase<T> {

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

/**
 * HTML-to-PDF service for entities that store PDFs.
 * Similar to PdfService but uses HTML templates instead of LaTeX.
 * 
 * @template S - The PDF entity type
 * @template T - The entity type that implements IPdfAble
 * @template P - The template parameters type (must extend PdfTemplateParameters)
 */
export abstract class HtmlPdfService<S extends Pdf, T extends IPdfAble<S>, P extends PdfTemplateParameters = PdfTemplateParameters> extends BaseHtmlPdfService<T, P> {
  fileService: FileService;

  abstract pdfConstructor: new () => S;

  constructor(fileLocation: string, manager?: EntityManager) {
    super(manager);
    this.fileService = new FileService(fileLocation);
  }

  public async createPdf(entity: T): Promise<S> {
    const user = await entity.getOwner();
    const html = await this.getHtml(entity);
    const buffer = await this.compileHtml(html);
    return this.fileService.uploadPdf<T, S>(entity, this.pdfConstructor, buffer, user);
  }
}

export abstract class UnstoredPdfService<T extends IUnstoredPdfAble, R extends RouteParams> extends BasePdfService<T, R> implements IPdfServiceBase<T> {

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

/**
 * HTML-to-PDF service for entities that don't store PDFs.
 * Similar to UnstoredPdfService but uses HTML templates instead of LaTeX.
 * 
 * @template T - The entity type that implements IUnstoredPdfAble
 * @template P - The template parameters type (must extend PdfTemplateParameters)
 */
export abstract class HtmlUnstoredPdfService<T extends IUnstoredPdfAble, P extends PdfTemplateParameters = PdfTemplateParameters> extends BaseHtmlPdfService<T, P> {
  // Inherits createPdf() and createRaw() from BaseHtmlPdfService
}
