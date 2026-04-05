import { PrismaService } from '@core/prisma/prisma.service'
import { Logger } from '@nestjs/common'
import { Ctx, On, Update } from 'nestjs-telegraf'

@Update()
export class ChatMemberUpdate {
  private readonly logger = new Logger(ChatMemberUpdate.name)

  constructor(private readonly prisma: PrismaService) {}

  @On('my_chat_member')
  async onMyChatMember(@Ctx() ctx: any) {
    const update = ctx.update?.my_chat_member
    if (!update || update.chat?.type !== 'private') return

    const telegramId = String(update.chat.id)
    const nextStatus = update.new_chat_member?.status
    const prevStatus = update.old_chat_member?.status

    if (!nextStatus) return

    const isLive = nextStatus !== 'kicked'

    const user = await this.prisma.users.findUnique({
      where: { telegramId },
      select: { id: true, telegramDataId: true },
    })

    if (!user?.telegramDataId) return

    await this.prisma.userTelegramData.update({
      where: { id: user.telegramDataId },
      data: { isLive },
    })

    this.logger.log(
      `my_chat_member processed: userId=${user.id}, telegramId=${telegramId}, oldStatus=${prevStatus ?? 'unknown'}, newStatus=${nextStatus}, isLive=${isLive}`,
    )
  }
}
