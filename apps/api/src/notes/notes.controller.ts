import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { NoteCreateSchema, type NoteCreate } from 'shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('notes')
export class NotesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('partyId') partyId?: string) {
    return this.prisma.note.findMany({
      where: partyId ? { partyId } : {},
      include: { party: { select: { name: true } }, createdBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post()
  create(@Body(new ZodPipe(NoteCreateSchema)) body: NoteCreate, @CurrentUser() user: AuthUser) {
    return this.prisma.note.create({
      data: {
        partyId: body.partyId ?? null,
        itemId: body.itemId ?? null,
        channel: body.channel,
        text: body.text,
        attachmentUrl: body.attachmentUrl,
        createdById: user.id,
      },
    });
  }
}
