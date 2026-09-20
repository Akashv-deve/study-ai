import { GridFSBucket, ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import fs from 'fs';
import { pipeline } from 'stream/promises';

const BUCKET_NAME = 'projectArchives';

function bucket(): GridFSBucket {
  if (!mongoose.connection.db) throw new Error('MongoDB storage is unavailable');
  return new GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

export async function storeProjectArchive(localPath: string, filename: string, userId: string, projectId: string): Promise<string> {
  const upload = bucket().openUploadStream(filename, { metadata: { userId, projectId, private: true } });
  try {
    await pipeline(fs.createReadStream(localPath), upload);
    return upload.id.toString();
  } catch (error) {
    // A failed stream can leave a files/chunks pair behind. Best-effort cleanup
    // must not hide the original storage error.
    await bucket().delete(upload.id).catch(() => undefined);
    throw error;
  }
}

export async function restoreProjectArchive(archiveId: string, destination: string): Promise<void> {
  if (!ObjectId.isValid(archiveId)) throw new Error('Invalid archive reference');
  await pipeline(bucket().openDownloadStream(new ObjectId(archiveId)), fs.createWriteStream(destination, { flags: 'wx' }));
}

export async function deleteProjectArchive(archiveId?: string): Promise<void> {
  if (!archiveId || !ObjectId.isValid(archiveId)) return;
  try { await bucket().delete(new ObjectId(archiveId)); } catch (error) {
    // GridFS reports a missing file as an error. Deletion is intentionally idempotent.
    if (!(error instanceof Error) || !/not found/i.test(error.message)) throw error;
  }
}
