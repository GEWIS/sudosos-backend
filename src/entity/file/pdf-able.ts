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
 * This is the module page of the pdf-able.
 *
 * @module files/pdf
 */

import Pdf from './pdf-file';
import BaseEntity from '../base-entity';
import User from '../user/user';
import { PdfService, RouteParams, UnstoredPdfService } from '../../service/pdf/pdf-service';
import { hashJSON } from '../../helpers/hash';

type Constructor<T = {}> = new (...args: any[]) => T;

export interface IPdfAble<S extends Pdf = Pdf> extends BaseEntity {
  pdf?: S,

  getPdfParamHash(): Promise<string>,

  createPdf(): Promise<S>

  getOwner(): Promise<User>
}

/**
 * PdfAble is a Mixin that allows entities to be converted to Pdf.
 * @param Base
 * @constructor
 */
export function PdfAble<TBase extends Constructor<BaseEntity>>(Base: TBase) {
  abstract class PdfAbleClass extends Base {
    /**
     * The id of the Pdf file.
     */
    abstract pdfId?: number;

    /**
     * The Pdf file.
     */
    abstract pdf?: Pdf;

    /**
     * The service that creates the Pdf file.
     */
    abstract pdfService: PdfService<Pdf, this, RouteParams>;

    /**
     * Get the owner of the Pdf file.
     * Needed for the File.createdBy field.
     */
    abstract getOwner(): Promise<User>;

    /**
     * Create the Pdf file.
     */
    async createPdf(): Promise<Pdf> {
      return this.pdfService.createPdf(this as any);
    }

    /**
     * Get the hash of the parameters of the Pdf file.
     */
    async getPdfParamHash(): Promise<string> {
      return hashJSON(await this.pdfService.getParameters(this as any));
    }

    /**
     * Get the Pdf file.
     * If the Pdf file is not current, create it.
     * @param force If true, always create the Pdf file.
     */
    public async getOrCreatePdf(force: boolean = false): Promise<Pdf> {
      if (this.pdf && !force) {
        // check if pdf is current.
        if (await this.validatePdfHash()) return this.pdf;
      }

      return Promise.resolve(await this.createPdf());
    }

    /**
     * Validates if the Pdf matches the stored hash.
     */
    async validatePdfHash(): Promise<boolean> {
      if (!this.pdf) return false;
      const hash = await this.getPdfParamHash();

      return hash === this.pdf.hash;
    }
  }

  return PdfAbleClass;
}

export interface IUnstoredPdfAble {
  createPdf(): Promise<Buffer>;
}

export function UnstoredPdfAble<TBase extends Constructor>(Base: TBase) {
  abstract class UnstoredPdfAbleClass extends Base implements IUnstoredPdfAble {
    /**
     * The service that creates the Pdf buffer.
     */
    abstract pdfService: UnstoredPdfService<UnstoredPdfAbleClass, RouteParams>;

    /**
     * Create the Pdf buffer.
     * This method generates the PDF and returns it as a Buffer.
     */
    async createPdf(): Promise<Buffer> {
      return this.pdfService.createPdf(this as UnstoredPdfAbleClass);
    }

    async createTex(): Promise<Buffer> {
      return this.pdfService.createTex(this as UnstoredPdfAbleClass);
    }

    async getPdfParamHash(): Promise<string> {
      return hashJSON(await this.pdfService.getParameters(this as UnstoredPdfAbleClass));
    }
  }

  return UnstoredPdfAbleClass;
}
