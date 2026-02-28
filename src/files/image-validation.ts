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
 * This is the module page of the image-validation.
 *
 * @module internal/files/image-validation
 */

import { UploadedFile } from 'express-fileupload';
import Sharp, { Metadata } from 'sharp';
import { INVALID_IMAGE_FILE } from '../controller/request/validators/validation-errors';
import { toFail, toPass, ValidationError, Either } from '../helpers/specification-validation';

export type ImageType = 'product' | 'banner';

export interface ImageValidationRequirements {
  minWidth: number;
  minHeight: number;
  aspectRatio: number;
  aspectRatioTolerance: number;
  aspectRatioLabel: string;
  allowedFormats: string[];
}

export const ALLOWED_IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'gif'];

export const IMAGE_REQUIREMENTS: Record<ImageType, ImageValidationRequirements> = {
  product: {
    minWidth: 64,
    minHeight: 64,
    aspectRatio: 1,
    aspectRatioTolerance: 0.4,
    aspectRatioLabel: '1:1',
    allowedFormats: ALLOWED_IMAGE_FORMATS,
  },
  banner: {
    minWidth: 64,
    minHeight: 128,
    aspectRatio: 9 / 20,
    aspectRatioTolerance: 0.5,
    aspectRatioLabel: '9:20',
    allowedFormats: ALLOWED_IMAGE_FORMATS,
  },
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export async function validateImageUpload(
  uploadedFile: UploadedFile,
  imageType: ImageType,
): Promise<Either<ValidationError, void>> {
  if (!uploadedFile?.data || uploadedFile.data.length === 0) {
    return toFail(INVALID_IMAGE_FILE('File data is missing.'));
  }

  const requirements = IMAGE_REQUIREMENTS[imageType];

  let metadata: Metadata;
  try {
    metadata = await Sharp(uploadedFile.data).metadata();
  } catch (error) {
    return toFail(INVALID_IMAGE_FILE('File is not a valid or supported image.'));
  }

  if (!metadata.format || !requirements.allowedFormats.includes(metadata.format)) {
    const receivedFormat = metadata.format ?? 'unknown';
    return toFail(INVALID_IMAGE_FILE(
      `Unsupported image format (${receivedFormat}). Allowed formats: ${requirements.allowedFormats.join(', ')
      }.`,
    ));
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    return toFail(INVALID_IMAGE_FILE('Image dimensions could not be determined.'));
  }

  if (width < requirements.minWidth || height < requirements.minHeight) {
    return toFail(INVALID_IMAGE_FILE(
      `Image resolution must be at least ${requirements.minWidth}x${requirements.minHeight}px `
            + `(received ${width}x${height}px).`,
    ));
  }

  const ratio = width / height;
  const ratioDiff = Math.abs(ratio - requirements.aspectRatio) / requirements.aspectRatio;
  if (ratioDiff > requirements.aspectRatioTolerance) {
    return toFail(INVALID_IMAGE_FILE(
      `Image aspect ratio must be ${requirements.aspectRatioLabel} `
            + `(+/- ${formatPercent(requirements.aspectRatioTolerance)}).`,
    ));
  }
  return toPass(undefined);
}
