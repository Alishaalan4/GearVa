import { Module } from '@nestjs/common';
import { FILE_STORAGE, LocalFileStorage } from './file-storage';

@Module({
  providers: [{ provide: FILE_STORAGE, useClass: LocalFileStorage }],
  exports: [FILE_STORAGE],
})
export class FilesModule {}
