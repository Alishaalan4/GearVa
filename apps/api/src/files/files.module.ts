import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { FILE_STORAGE, LocalFileStorage, S3FileStorage } from './file-storage';

/** FILES_ADAPTER picks where file bytes live: `local` (development, tests) or `s3` (R2). */
@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.FILES_ADAPTER === 's3' ? new S3FileStorage(env) : new LocalFileStorage(env),
    },
  ],
  exports: [FILE_STORAGE],
})
export class FilesModule {}
