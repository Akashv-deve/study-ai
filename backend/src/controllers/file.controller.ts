import { Request, Response, NextFunction } from 'express';
import { ProjectFile } from '../models/projectFile.model';
import { FileContent } from '../models/fileContent.model';
import { NotFoundError } from '../utils/errors';
import { projectRepository } from '../repositories/project.repository';

export async function getFileTree(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await projectRepository.findOwnedById(String(req.params.projectId), req.user!.id);
    if (!project) throw new NotFoundError('Project not found');
    const files = await ProjectFile.find({ projectId: project._id }).sort({ path: 1 });
    res.json({ data: files });
  } catch (err) {
    next(err);
  }
}

export async function getFileContent(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await projectRepository.findOwnedById(String(req.params.projectId), req.user!.id);
    if (!project) throw new NotFoundError('Project not found');
    const file = await ProjectFile.findOne({ _id: String(req.params.fileId), projectId: project._id });
    if (!file) throw new NotFoundError('File metadata not found');

    const contentDoc = await FileContent.findOne({ projectId: file.projectId, filePath: file.path });
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
