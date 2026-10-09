import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, Req, Res, UploadedFile, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { LIMITS } from '@rovere/importers';
import { SessionGuard } from '../identity/guard.js';
import type { AuthenticatedRequest } from '../identity/guard.js';
import { ImportsService } from './imports.service.js';
import type { Upload } from './imports.service.js';
import { ImportErrors } from './errors.js';

@Controller('imports')
@UseGuards(SessionGuard)
@UseFilters(new ImportErrors())
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly imports: ImportsService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.imports.list(req.ownerId); }
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITS.bytes, files: 1, fields: 2, parts: 3, fieldSize: 16000 } }))
  upload(@Req() req: AuthenticatedRequest, @UploadedFile() file: Upload | undefined, @Body() body: unknown, @Headers('idempotency-key') token: unknown) {
    return this.imports.upload(req.ownerId, file, body, token);
  }
  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.imports.get(req.ownerId, id); }
  @Get(':id/file')
  async file(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res() res: Response) {
    const file = await this.imports.file(req.ownerId, id);
    res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(Buffer.from(file.bytes));
  }
  @Get(':id/rows')
  rows(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: Record<string, unknown>) { return this.imports.rows(req.ownerId, id, query); }
  @Patch(':id/review')
  review(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.imports.review(req.ownerId, id, body); }
  @Post(':id/retry')
  retry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.imports.retry(req.ownerId, id, body); }
  @Delete(':id')
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) { return this.imports.cancel(req.ownerId, id, body); }
}
