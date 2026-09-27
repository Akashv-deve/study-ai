import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ProjectFile } from '../models/projectFile.model';
import { FileContent } from '../models/fileContent.model';
import { NotFoundError } from '../utils/errors';
import { projectRepository } from '../repositories/project.repository';

// Fields the UI never reads (content hash, storage pointer, timestamps, version key) are not sent.
const FILE_FIELDS = '-hash -contentId -createdAt -updatedAt -__v';

export async function getFileTree(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await projectRepository.findOwnedById(String(req.params.projectId), req.user!.id);
    if (!project) throw new NotFoundError('Project not found');
    const files = await ProjectFile.find({ projectId: project._id }).select(FILE_FIELDS).sort({ path: 1 }).lean();
    res.json({ data: files });
  } catch (err) {
    next(err);
  }
}

export async function getFileContent(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = String(req.params.projectId);
    const fileId = String(req.params.fileId);
    if (!mongoose.Types.ObjectId.isValid(projectId)) throw new NotFoundError('Project not found');
    if (!mongoose.Types.ObjectId.isValid(fileId)) throw new NotFoundError('File metadata not found');

    // The ownership check and the file lookup do not depend on each other, so they run together
    // (one fewer sequential database round trip per click). Nothing is returned unless the project is owned.
    const [project, file] = await Promise.all([
      projectRepository.findOwnedById(projectId, req.user!.id),
      ProjectFile.findOne({ _id: fileId, projectId }).select(FILE_FIELDS).lean(),
    ]);
    if (!project) throw new NotFoundError('Project not found');
    if (!file) throw new NotFoundError('File metadata not found');

    const contentDoc = await FileContent.findOne({ projectId: project._id, filePath: file.path }).select('content').lean();
    res.json({
      data: {
        file,
        content: contentDoc ? contentDoc.content : '// Content unavailable or binary file',
      },
    });
  } catch (err) {
    next(err);
  }
}
