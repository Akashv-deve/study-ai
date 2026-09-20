export interface Project {
  _id: string;
  name: string;
  description?: string;
  sourceType: 'zip' | 'github';
  processingStatus: 'queued' | 'uploading' | 'extracting' | 'scanning' | 'indexing' | 'ready' | 'failed' | 'cancelled';
  processingJobId?: string;
  languages: string[];
  frameworks: string[];
  fileCount: number;
  analyzableFileCount: number;
  mainLanguage?: string;
  projectType?: string;
  scanLimits?: { reached: boolean; reasons: string[]; scannedFileCount: number; analyzedFileCount: number };
  updatedAt: string;
  createdAt: string;
}

export interface ProjectFile {
  _id: string;
  projectId: string;
  path: string;
  name: string;
  directory: string;
  extension: string;
  language: string;
  size: number;
  isBinary: boolean;
  isAnalyzable: boolean;
  isAnalyzed?: boolean;
  analysisStatus?: string;
}

export interface ProcessingJob {
  jobId: string;
  projectId: string;
  status: 'queued' | 'uploading' | 'extracting' | 'scanning' | 'indexing' | 'ready' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  error?: string;
}

export interface AIGeneration {
  _id: string;
  projectId: string;
  type: string;
  title: string;
  content: string;
  filePath?: string;
  model: string;
  status: string;
  createdAt: string;
}
