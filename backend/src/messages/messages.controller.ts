// backend/src/messages/messages.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { UpdateMessageStatusDto } from './dto/update-message-status.dto';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async create(@Body() dto: CreateMessageDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.create(dto, actor);
  }

  @Get()
  async findAll(@Query() query: MessageQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.findAll(query, actor);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.findOne(id, actor);
  }

  @Post(':id/reply')
  async reply(@Param('id') id: string, @Body() dto: ReplyMessageDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.reply(id, dto, actor);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateMessageStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.updateStatus(id, dto.status, actor);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.markAsRead(id, actor);
  }
}