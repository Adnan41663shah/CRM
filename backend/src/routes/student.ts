import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import {
  importStudents,
  getStudents,
  getImportStatus,
} from '../controllers/studentController';

const router = express.Router();

// Upload directory for import files (disk storage for large files)
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'imports');
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (err) {
  // Ignore if already exists
}

const storage = multer.diskStorage({
  destination: (_req: express.Request, _file: Express.Multer.File, cb: (error: Error | null, dest: string) => void) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${path.extname(file.originalname) || ''}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit unchanged
  },
  fileFilter: (_req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) and CSV files are allowed.'));
    }
  },
});

router.use(authenticate);

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.user && (req.user as { role?: string }).role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.',
    });
  }
  next();
};

router.use(requireAdmin);

router.post('/import', upload.single('file'), importStudents);
router.get('/import-status/:jobId', getImportStatus);
router.get('/', getStudents);

export default router;
