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
 * This is the page of pdf-service.
 *
 * @module internal/pdf
 */

import Pdf from '../../entity/file/pdf-file';
import {
  Client,
  FileResponse,
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
import { postCompileHtml } from '@gewis/pdf-compiler-ts';
import { createClient, type Client as PdfCompilerClient } from '@gewis/pdf-compiler-ts/dist/client/client';

/**
 * Base interface for all PDF services.
 * - createPdfBuffer always produces the PDF bytes
 * - createRaw produces raw output (tex or html) as bytes
 * - getParameters must be implemented by concrete services
 */
export interface IPdfServiceBase<T> {
  createPdfBuffer(entity: T): Promise<Buffer>;
  createRaw(entity: T): Promise<Buffer>;
  getParameters(entity: T): Promise<any>;
}

/**
 * Optional interface for services that also persist and return a Pdf entity.
 * Services that do not persist can simply not implement this interface.
 */
export interface IStoredPdfService<T, S extends Pdf> {
  createPdfWithEntity(entity: T): Promise<S>;
}

/**
 * Type alias for template parameters used in HTML PDF services.
 * Parameters must be a record (object) with string keys.
 */
export type PdfTemplateParameters = Record<string, any>;

/**
 * Type alias for a function that generates HTML from a data object.
 * @param options The data to be used in the HTML template.
 * @returns The generated HTML as a string.
 */
export type HtmlGenerator<P> = (options: P) => string;

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

/**
 * Base PDF service that always provides bytes.
 * Concrete services that store a Pdf entity should implement IStoredPdfService.
 */
export abstract class BasePdfService<T, R extends RouteParams>
  extends WithManager
  implements IPdfServiceBase<T> {
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

  public async getRouteParams(entity: T, fileType = ReturnFileType.PDF): Promise<R> {
    const params = await this.getParameters(entity);
    const settings = this.getFileSettings(fileType);
    return new this.routeConstructor({ params, settings });
  }

  /**
   * Core method that generates and returns the PDF bytes.
   */
  public async createPdfBuffer(entity: T): Promise<Buffer> {
    const routeParams = await this.getRouteParams(entity, ReturnFileType.PDF);

    try {
      const res = await this.generator(routeParams);
      const blob = res.data;
      return Buffer.from(await blob.arrayBuffer());
    } catch (res: any) {
      throw new PdfError(`Pdf generation failed: ${res?.message ?? String(res)}`);
    }
  }

  /**
   * Create raw output such as TEX or HTML bytes for preview or debugging.
   */
  public async createRaw(entity: T): Promise<Buffer> {
    const routeParams = await this.getRouteParams(entity, ReturnFileType.TEX);

    try {
      const res = await this.generator(routeParams);
      const blob = res.data;
      return Buffer.from(await blob.arrayBuffer());
    } catch (res: any) {
      throw new PdfError(`Pdf generation failed: ${res?.message ?? String(res)}`);
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
 * Produces bytes via createPdfBuffer. Concrete stored services should
 * implement createPdfWithEntity to persist and return the Pdf entity.
 *
 * Templates are stored in static/pdf/ and use {{ key }} placeholders.
 *
 * @template T - The entity type
 * @template P - The template parameters type
 */
export abstract class BaseHtmlPdfService<T, P extends PdfTemplateParameters = PdfTemplateParameters>
  extends WithManager
  implements IPdfServiceBase<T> {
  protected htmlPdfGenUrl: string;

  protected client: PdfCompilerClient;

  /**
   * The function that generates the HTML.
   * This function should take a data object and return the complete HTML string.
   */
  abstract htmlGenerator: HtmlGenerator<P>;

  constructor(manager?: EntityManager) {
    super(manager);
    this.htmlPdfGenUrl = process.env.HTML_PDF_GEN_URL ?? 'http://localhost:3001';
    // Create a client instance per service instance to avoid race conditions
    this.client = createClient({ baseUrl: this.htmlPdfGenUrl });
  }

  /**
   * Get the data object to use with the HTML template.
   */
  public abstract getParameters(entity: T): Promise<P>;

  /**
   * Apply parameters to the template and return the complete HTML.
   */
  protected async getHtml(entity: T): Promise<string> {
    const data = await this.getParameters(entity);
    return this.htmlGenerator(data);
  }

  /**
   * Compile HTML to PDF using the external service.
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
      throw new PdfError(`HTML PDF generation failed: ${error?.message ?? String(error)}`);
    }
  }

  /**
   * Create a PDF and return bytes.
   */
  public async createPdfBuffer(entity: T): Promise<Buffer> {
    const html = await this.getHtml(entity);
    return this.compileHtml(html);
  }

  /**
   * Create raw HTML output (for debugging or preview).
   */
  public async createRaw(entity: T): Promise<Buffer> {
    const html = await this.getHtml(entity);
    return Buffer.from(html, 'utf-8');
  }
}

/**
 * Stored PDF service.
 * Uses BasePdfService to produce bytes then uploads and returns the Pdf entity.
 */
export abstract class PdfService<S extends Pdf, T extends IPdfAble<S>, R extends RouteParams>
  extends BasePdfService<T, R>
  implements IStoredPdfService<T, S> {
  fileService: FileService;

  abstract pdfConstructor: new () => S;

  constructor(fileLocation: string, manager?: EntityManager) {
    super(manager);
    this.fileService = new FileService(fileLocation);
  }

  /**
   * Persist the generated PDF and return the stored Pdf entity.
   */
  public async createPdfWithEntity(entity: T): Promise<S> {
    const buffer = await this.createPdfBuffer(entity);
    const user = await entity.getOwner();
    return this.fileService.uploadPdf<T, S>(entity, this.pdfConstructor, buffer, user);
  }
}

/**
 * HTML-to-PDF service for entities that store PDFs.
 * Similar to PdfService but uses HTML templates instead of LaTeX.
 */
export abstract class HtmlPdfService<S extends Pdf, T extends IPdfAble<S>, P extends PdfTemplateParameters = PdfTemplateParameters>
  extends BaseHtmlPdfService<T, P>
  implements IStoredPdfService<T, S> {
  fileService: FileService;

  abstract pdfConstructor: new () => S;

  constructor(fileLocation: string, manager?: EntityManager) {
    super(manager);
    this.fileService = new FileService(fileLocation);
  }

  /**
   * Persist the generated PDF and return the stored Pdf entity.
   */
  public async createPdfWithEntity(entity: T): Promise<S> {
    const buffer = await this.createPdfBuffer(entity);
    const user = await entity.getOwner();
    return this.fileService.uploadPdf<T, S>(entity, this.pdfConstructor, buffer, user);
  }
}

/**
 * UnstoredPdfService - produces bytes but does not persist.
 * It inherits createPdfBuffer and createRaw from BasePdfService.
 * It does not implement any stored interface.
 */
export abstract class UnstoredPdfService<T extends IUnstoredPdfAble, R extends RouteParams>
  extends BasePdfService<T, R> {
  // No additional logic required. createPdfBuffer and createRaw come from BasePdfService.
}

/**
 * HTML-to-PDF service for entities that don't store PDFs.
 * It inherits createPdfBuffer and createRaw from BaseHtmlPdfService.
 * It does not implement any stored interface.
 */
export abstract class HtmlUnstoredPdfService<T extends IUnstoredPdfAble, P extends PdfTemplateParameters = PdfTemplateParameters>
  extends BaseHtmlPdfService<T, P> {
  // No additional logic required.
}
