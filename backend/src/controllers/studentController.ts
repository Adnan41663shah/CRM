import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import Student, { IStudent } from '../models/Student';
import ImportJob from '../models/ImportJob';
import ExcelJS from 'exceljs';
import logger from '../utils/logger';
import { emitToRole } from '../services/socketService';
import mongoose from 'mongoose';

const BATCH_SIZE = 400;
const MAX_ERROR_SAMPLES = 20;

/* -----------------------------------------
   Excel Column Mapping
------------------------------------------ */
const mapExcelColumnToField = (columnName: string): string | null => {
  const normalized = columnName.toLowerCase().trim();
  const mapping: Record<string, string> = {
    'student name': 'studentName', 'studentname': 'studentName', 'name': 'studentName',
    'mobile number': 'mobileNumber', 'mobile number with country code': 'mobileNumber',
    'mobilenumber': 'mobileNumber', 'phone': 'mobileNumber', 'phone number': 'mobileNumber',
    'email': 'email', 'course': 'course', 'center': 'center', 'status': 'status',
    'attended by': 'attendedBy', 'attendedby': 'attendedBy', 'attended': 'attendedBy',
    'created by': 'createdBy', 'createdby': 'createdBy',
    'attended at': 'attendedAt', 'attendedat': 'attendedAt',
    'notes': 'notes', 'note': 'notes',
  };
  return mapping[normalized] || null;
};

const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') {
    if (value !== null && 'richText' in value) {
      const rt = (value as { richText: { text: string }[] }).richText;
      return rt.map((r) => r.text).join('').trim() || '-';
    }
    if (value !== null && 'result' in value) {
      return normalizeValue((value as { result: unknown }).result);
    }
    if (value !== null && 'text' in value) {
      return String((value as { text: string }).text).trim() || '-';
    }
    if (value instanceof Date) return value.toISOString().split('T')[0];
    if (value !== null && 'error' in value) return '-';
    return String(value).trim() || '-';
  }
  return String(value).trim() || '-';
};

function rowToStudent(
  columnMap: Record<string, number>,
  row: string[],
  rowIndex: number
): Partial<IStudent> | null {
  const student: Partial<IStudent> = {
    studentName: '-',
    mobileNumber: '-',
    email: '-',
    course: '-',
    center: '-',
    status: '-',
    attendedBy: '-',
    createdBy: '-',
    attendedAt: '-',
    notes: '-',
  };
  for (const [field, index] of Object.entries(columnMap)) {
    const raw = row[index];
    (student as Record<string, string>)[field] = normalizeValue(raw);
  }
  if (!student.mobileNumber || student.mobileNumber === '-') return null;
  return student;
}

function rowToStudentFromExcel(
  columnMap: Record<string, number>,
  rowValues: unknown[]
): Partial<IStudent> | null {
  const student: Partial<IStudent> = {
    studentName: '-',
    mobileNumber: '-',
    email: '-',
    course: '-',
    center: '-',
    status: '-',
    attendedBy: '-',
    createdBy: '-',
    attendedAt: '-',
    notes: '-',
  };
  // ExcelJS row.values is 1-based: index 0 is empty, data starts at 1
  for (const [field, colIndex] of Object.entries(columnMap)) {
    const raw = rowValues[colIndex + 1];
    (student as Record<string, string>)[field] = normalizeValue(raw);
  }
  if (!student.mobileNumber || student.mobileNumber === '-') return null;
  return student;
}

/* -----------------------------------------
   IMPORT STUDENTS – enqueue job, return immediately
------------------------------------------ */
export const importStudents = async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/octet-stream',
    ];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore
      }
      return res.status(400).json({
        success: false,
        message: `Invalid file type: ${req.file.mimetype}. Please upload .xlsx or .csv`,
      });
    }

    const processingCount = await ImportJob.countDocuments({ status: 'processing' });
    if (processingCount > 0) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore
      }
      return res.status(503).json({
        success: false,
        message: 'Another import is in progress. Please try again later.',
      });
    }

    const job = await ImportJob.create({
      status: 'pending',
      total: 0,
      processed: 0,
      duplicates: 0,
      errorsCount: 0,
      errorSample: [],
      filePath: req.file.path,
    });

    setImmediate(() => {
      processImportJob(job._id as mongoose.Types.ObjectId).catch((err) => {
        logger.error('processImportJob fatal:', err);
      });
    });

    return res.status(200).json({
      success: true,
      jobId: String(job._id),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start import';
    logger.error('Import enqueue error:', error);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

/* -----------------------------------------
   Background: process import job (streaming + batch insert)
------------------------------------------ */
async function processImportJob(jobId: mongoose.Types.ObjectId): Promise<void> {
  const job = await ImportJob.findById(jobId);
  if (!job || job.status !== 'pending') {
    return;
  }

  const filePath = job.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      errorSample: ['File not found or already removed'],
      finishedAt: new Date(),
    });
    return;
  }

  await ImportJob.findByIdAndUpdate(jobId, {
    status: 'processing',
    startedAt: new Date(),
  });

  const ext = path.extname(filePath).toLowerCase();
  const isCSV = ext === '.csv';

  try {
    if (isCSV) {
      await processCSVImport(jobId, filePath);
    } else {
      await processExcelImport(jobId, filePath);
    }
  } catch (err) {
    logger.error('processImportJob error:', err);
    const message = err instanceof Error ? err.message : String(err);
    const currentJob = await ImportJob.findById(jobId).lean();
    const currentErrors = currentJob?.errorsCount ?? 0;
    const currentSamples = currentJob?.errorSample ?? [];
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      errorsCount: currentErrors,
      errorSample: [...currentSamples.slice(-(MAX_ERROR_SAMPLES - 1)), message].slice(-MAX_ERROR_SAMPLES),
      finishedAt: new Date(),
    });
    logger.error(`Import job ${jobId} failed: ${message}`);
  } finally {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      logger.warn('Cleanup file failed:', e);
    }

    try {
      emitToRole('admin', 'students:imported', {
        jobId: String(jobId),
        timestamp: new Date(),
      });
    } catch {
      // ignore socket
    }
  }
}

async function processCSVImport(jobId: mongoose.Types.ObjectId, filePath: string): Promise<void> {
  // Load all existing mobile numbers from database at the start
  logger.info('Loading existing mobile numbers from database...');
  const existingStudents = await Student.find({ mobileNumber: { $ne: '-' } })
    .select('mobileNumber')
    .lean();
  
  // Normalize mobile number for consistent comparison
  const normalizeMobileNumber = (mobile: string): string => {
    if (!mobile || mobile === '-') return '';
    return mobile.trim().replace(/\s+/g, '');
  };
  
  // Create Set of existing mobile numbers (normalized)
  const existingMobileNumbers = new Set<string>();
  for (const student of existingStudents) {
    const normalized = normalizeMobileNumber(student.mobileNumber);
    if (normalized) {
      existingMobileNumbers.add(normalized);
    }
  }
  logger.info(`Loaded ${existingMobileNumbers.size} existing mobile numbers from database`);
  
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const parser = parse({
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  let headers: string[] | null = null;
  let columnMap: Record<string, number> = {};
  let batch: Partial<IStudent>[] = [];
  let total = 0;
  let processed = 0;
  let duplicates = 0;
  let errorsCount = 0;
  let errorSample: string[] = [];
  let rowIndex = 0;
  let flushQueue: Promise<void> = Promise.resolve();
  
  // Track mobile numbers seen in this import to prevent duplicates within the same file
  const seenMobileNumbers = new Set<string>();

  interface BulkWriteErr {
    code: number;
    err?: { message?: string };
  }
  
  const flushBatch = async (batchToFlush: Partial<IStudent>[]): Promise<void> => {
    if (batchToFlush.length === 0) return;
    
    const ops = batchToFlush.map((doc) => ({
      insertOne: { document: doc as mongoose.mongo.OptionalId<IStudent> },
    }));
    try {
      const result = await Student.bulkWrite(ops, { ordered: false });
      const inserted = result.insertedCount;
      const writeErrors: BulkWriteErr[] = (result as unknown as { writeErrors?: BulkWriteErr[] }).writeErrors ?? [];
      const duplicateErrors = writeErrors.filter((e: BulkWriteErr) => e.code === 11000);
      const dupCount = duplicateErrors.length;
      const otherErrors = writeErrors.filter((e: BulkWriteErr) => e.code !== 11000);

      processed += inserted;
      // Note: duplicates are already counted before batch insert (same-file and existing DB duplicates)
      // These are additional duplicates that might have been inserted between our check and insert
      if (dupCount > 0) {
        duplicates += dupCount;
        logger.warn(`Found ${dupCount} additional duplicate(s) during batch insert (race condition)`);
      }
      if (otherErrors.length > 0) {
        errorsCount += otherErrors.length;
        for (const e of otherErrors.slice(0, MAX_ERROR_SAMPLES - errorSample.length)) {
          errorSample.push(`Row: ${e.err?.message ?? String(e)}`);
        }
      }

      const toUpdate: Record<string, unknown> = {
        total: total || processed,
        processed,
        duplicates,
        errorsCount,
        errorSample: errorSample.slice(-MAX_ERROR_SAMPLES),
      };
      await ImportJob.findByIdAndUpdate(jobId, toUpdate);
      logger.info(`Import progress: ${processed}/${total} processed, ${duplicates} skipped (duplicates), ${errorsCount} errors`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Batch insert error:', err);
      errorsCount += batchToFlush.length;
      errorSample.push(`Batch error: ${msg}`);
      if (errorSample.length > MAX_ERROR_SAMPLES) {
        errorSample = errorSample.slice(-MAX_ERROR_SAMPLES);
      }
      await ImportJob.findByIdAndUpdate(jobId, {
        total: total || processed,
        processed,
        duplicates,
        errorsCount,
        errorSample,
      });
      throw err;
    }
  };

  await new Promise<void>((resolve, reject) => {
    let hasError = false;
    
    parser.on('readable', function (this: NodeJS.ReadableStream) {
      if (hasError) return;
      let record: string[] | null;
      while ((record = parser.read() as string[] | null) !== null && !hasError) {
        rowIndex++;
        if (!headers) {
          headers = record.map((h) => normalizeValue(h));
          headers.forEach((h, i) => {
            const field = mapExcelColumnToField(h);
            if (field) columnMap[field] = i;
          });
          continue;
        }
        if (record.every((c) => !c || String(c).trim() === '')) continue;
        const student = rowToStudent(columnMap, record, rowIndex);
        if (student && student.mobileNumber) {
          const normalizedMobile = normalizeMobileNumber(student.mobileNumber);
          
          if (!normalizedMobile) {
            continue; // Skip if no valid mobile number
          }
          
          // Skip if duplicate within the same file
          if (seenMobileNumbers.has(normalizedMobile)) {
            duplicates++;
            continue;
          }
          
          // Skip if already exists in database
          if (existingMobileNumbers.has(normalizedMobile)) {
            duplicates++;
            continue;
          }
          
          // Add to seen set and batch (new unique number)
          seenMobileNumbers.add(normalizedMobile);
          total++;
          batch.push(student);
          
          if (batch.length >= BATCH_SIZE) {
            const batchToFlush = [...batch];
            batch = [];
            flushQueue = flushQueue
              .then(() => flushBatch(batchToFlush))
              .catch((err) => {
                hasError = true;
                reject(err);
              });
          }
        }
      }
    });

    parser.on('error', (err) => {
      hasError = true;
      logger.error('CSV parser error:', err);
      reject(err);
    });
    
    parser.on('end', async () => {
      try {
        await flushQueue;
        if (batch.length > 0) {
          await flushBatch(batch);
          batch = [];
        }
        // Final update with all duplicate counts (same-file + cross-file)
        await ImportJob.findByIdAndUpdate(jobId, {
          total: total || processed,
          processed,
          duplicates,
          status: 'completed',
          finishedAt: new Date(),
        });
        logger.info(`CSV import completed: ${processed} imported, ${duplicates} skipped (duplicates), ${errorsCount} errors. Total rows processed: ${total}`);
        resolve();
      } catch (e) {
        hasError = true;
        reject(e);
      }
    });

    stream.pipe(parser);
    stream.on('error', (err) => {
      hasError = true;
      logger.error('File stream error:', err);
      reject(err);
    });
  });
}

async function processExcelImport(jobId: mongoose.Types.ObjectId, filePath: string): Promise<void> {
  // Load all existing mobile numbers from database at the start
  logger.info('Loading existing mobile numbers from database...');
  const existingStudents = await Student.find({ mobileNumber: { $ne: '-' } })
    .select('mobileNumber')
    .lean();
  
  // Normalize mobile number for consistent comparison
  const normalizeMobileNumber = (mobile: string): string => {
    if (!mobile || mobile === '-') return '';
    return mobile.trim().replace(/\s+/g, '');
  };
  
  // Create Set of existing mobile numbers (normalized)
  const existingMobileNumbers = new Set<string>();
  for (const student of existingStudents) {
    const normalized = normalizeMobileNumber(student.mobileNumber);
    if (normalized) {
      existingMobileNumbers.add(normalized);
    }
  }
  logger.info(`Loaded ${existingMobileNumbers.size} existing mobile numbers from database`);
  
  const stream = fs.createReadStream(filePath);
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(stream, {});

  let columnMap: Record<string, number> = {};
  let headersDone = false;
  let batch: Partial<IStudent>[] = [];
  let processed = 0;
  let duplicates = 0;
  let errorsCount = 0;
  let errorSample: string[] = [];
  let rowIndex = 0;
  let total = 0;
  let flushQueue: Promise<void> = Promise.resolve();
  
  // Track mobile numbers seen in this import to prevent duplicates within the same file
  const seenMobileNumbers = new Set<string>();

  interface BulkWriteErrExcel {
    code: number;
    err?: { message?: string };
  }
  const flushBatch = async (batchToFlush: Partial<IStudent>[]): Promise<void> => {
    if (batchToFlush.length === 0) return;
    const ops = batchToFlush.map((doc) => ({
      insertOne: { document: doc as mongoose.mongo.OptionalId<IStudent> },
    }));
    try {
      const result = await Student.bulkWrite(ops, { ordered: false });
      const inserted = result.insertedCount;
      const writeErrors: BulkWriteErrExcel[] = (result as unknown as { writeErrors?: BulkWriteErrExcel[] }).writeErrors ?? [];
      const duplicateErrors = writeErrors.filter((e: BulkWriteErrExcel) => e.code === 11000);
      const dupCount = duplicateErrors.length;
      const otherErrors = writeErrors.filter((e: BulkWriteErrExcel) => e.code !== 11000);

      processed += inserted;
      // Note: duplicates are already counted before batch insert (same-file and existing DB duplicates)
      // These are additional duplicates that might have been inserted between our check and insert
      if (dupCount > 0) {
        duplicates += dupCount;
        logger.warn(`Found ${dupCount} additional duplicate(s) during batch insert (race condition)`);
      }
      if (otherErrors.length > 0) {
        errorsCount += otherErrors.length;
        for (const e of otherErrors.slice(0, MAX_ERROR_SAMPLES - errorSample.length)) {
          errorSample.push(`Row: ${e.err?.message ?? String(e)}`);
        }
      }
      await ImportJob.findByIdAndUpdate(jobId, {
        total: total || processed,
        processed,
        duplicates,
        errorsCount,
        errorSample: errorSample.slice(-MAX_ERROR_SAMPLES),
      });
      logger.info(`Import progress: ${processed}/${total} processed, ${duplicates} skipped (duplicates), ${errorsCount} errors`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Batch insert error:', err);
      errorsCount += batchToFlush.length;
      errorSample.push(`Batch error: ${msg}`);
      if (errorSample.length > MAX_ERROR_SAMPLES) errorSample = errorSample.slice(-MAX_ERROR_SAMPLES);
      await ImportJob.findByIdAndUpdate(jobId, {
        total: total || processed,
        processed,
        duplicates,
        errorsCount,
        errorSample,
      });
      throw err;
    }
  };

  type RowLike = { values: unknown[]; number: number };
  type WorksheetReaderLike = { on(event: string, fn: (row: RowLike) => void): void; read(): Promise<void> };
  const reader = workbookReader as unknown as NodeJS.EventEmitter & { read(input?: unknown, options?: unknown): Promise<void> };

  await new Promise<void>((resolve, reject) => {
    let hasError = false;
    
    reader.on('worksheet', (worksheet: WorksheetReaderLike) => {
      worksheet.on('row', (row: RowLike) => {
        if (hasError) return;
        rowIndex = row.number;
        const values = row.values ?? [];
        if (!headersDone) {
          const headerStrings = (values as unknown[]).slice(1).map((v) => normalizeValue(v));
          headerStrings.forEach((h, i) => {
            const field = mapExcelColumnToField(h);
            if (field) columnMap[field] = i;
          });
          headersDone = true;
          return;
        }
        const rowValues = values as unknown[];
        if (rowValues.slice(1).every((v) => normalizeValue(v) === '-')) return;
        const student = rowToStudentFromExcel(columnMap, rowValues);
        if (student && student.mobileNumber) {
          const normalizedMobile = normalizeMobileNumber(student.mobileNumber);
          
          if (!normalizedMobile) {
            return; // Skip if no valid mobile number
          }
          
          // Skip if duplicate within the same file
          if (seenMobileNumbers.has(normalizedMobile)) {
            duplicates++;
            return; // Skip this row
          }
          
          // Skip if already exists in database
          if (existingMobileNumbers.has(normalizedMobile)) {
            duplicates++;
            return; // Skip this row
          }
          
          // Add to seen set and batch (new unique number)
          seenMobileNumbers.add(normalizedMobile);
          batch.push(student);
          total++;
          
          if (batch.length >= BATCH_SIZE) {
            const batchToFlush = [...batch];
            batch = [];
            flushQueue = flushQueue
              .then(() => flushBatch(batchToFlush))
              .catch((err) => {
                hasError = true;
                logger.error('Excel batch flush error:', err);
                reject(err);
              });
          }
        }
      });
      worksheet.read().catch((err) => {
        hasError = true;
        logger.error('Worksheet read error:', err);
        reject(err);
      });
    });

    reader.on('end', async () => {
      try {
        await flushQueue;
        if (batch.length > 0) {
          await flushBatch(batch);
          batch = [];
        }
        // Final update with all duplicate counts (same-file + cross-file)
        await ImportJob.findByIdAndUpdate(jobId, {
          total: total || processed,
          processed,
          duplicates,
          status: 'completed',
          finishedAt: new Date(),
        });
        logger.info(`Excel import completed: ${processed} imported, ${duplicates} skipped (duplicates), ${errorsCount} errors. Total rows processed: ${total}`);
        resolve();
      } catch (e) {
        hasError = true;
        reject(e);
      }
    });

    reader.on('error', (err) => {
      hasError = true;
      logger.error('Workbook reader error:', err);
      reject(err);
    });
    reader.read().catch((err) => {
      hasError = true;
      logger.error('Workbook read error:', err);
      reject(err);
    });
  });
}

/* -----------------------------------------
   GET IMPORT STATUS
------------------------------------------ */
export const getImportStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    if (!jobId || !mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID',
      });
    }
    const job = await ImportJob.findById(jobId).lean();
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Import job not found',
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        status: job.status,
        total: job.total,
        processed: job.processed,
        duplicates: job.duplicates,
        errorsCount: job.errorsCount,
        errorSample: job.errorSample ?? [],
      },
    });
  } catch (error: unknown) {
    logger.error('getImportStatus error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch import status',
    });
  }
};

/* -----------------------------------------
   GET STUDENTS (with pagination)
------------------------------------------ */
export const getStudents = async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { mobileNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { course: { $regex: search, $options: 'i' } },
        { center: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    
    // Use Promise.allSettled to handle partial failures gracefully
    const [studentsResult, totalCountResult] = await Promise.allSettled([
      Student.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().maxTimeMS(10000),
      Student.countDocuments(query).maxTimeMS(10000),
    ]);

    const students = studentsResult.status === 'fulfilled' ? studentsResult.value : [];
    const totalCount = totalCountResult.status === 'fulfilled' ? totalCountResult.value : 0;

    if (studentsResult.status === 'rejected') {
      logger.warn('Get students query failed:', studentsResult.reason);
    }
    if (totalCountResult.status === 'rejected') {
      logger.warn('Get students count failed:', totalCountResult.reason);
    }

    const pages = Math.ceil(totalCount / limit) || 1;

    res.status(200).json({
      success: true,
      data: {
        students,
        pagination: {
          total: totalCount,
          page,
          limit,
          pages,
        },
      },
    });
  } catch (error: unknown) {
    logger.error('Get students error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
    });
  }
};
