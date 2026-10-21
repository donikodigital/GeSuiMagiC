//backend/src/attachments/attachments.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AttachmentsService } from './attachments.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { AttachmentQueryDto } from './dto/attachment-query.dto';

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('presign')
  async presign(@Body() dto: PresignUploadDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.attachmentsService.presign(dto, actor);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  async create(@Body() dto: CreateAttachmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.attachmentsService.create(dto, actor);
  }

  @Get()
  async findFor(@Query() query: AttachmentQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.attachmentsService.findFor(query, actor);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.attachmentsService.remove(id, actor);
  }
}
