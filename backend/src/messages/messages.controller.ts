//backend/src/messages/messages.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { UpdateMessageStatusDto } from './dto/update-message-status.dto';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // Limite l'envoi en rafale (chaque message declenche des notifications / emails).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  async create(@Body() dto: CreateMessageDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.create(dto, actor);
  }

  @Get()
  async findAll(@Query() query: MessageQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.findAll(query, actor);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.findOne(id, actor);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/reply')
  async reply(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplyMessageDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.reply(id, dto, actor);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMessageStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.updateStatus(id, dto.status, actor);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.markAsRead(id, actor);
  }
}
