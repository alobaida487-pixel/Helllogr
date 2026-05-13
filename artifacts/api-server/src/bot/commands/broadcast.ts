import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
} from "discord.js";
import { type BotCommand } from "../client.js";
import { logger } from "../../lib/logger.js";

const data = new SlashCommandBuilder()
  .setName("broadcast")
  .setDescription("أرسل رسالة لجميع أعضاء السيرفر عبر الخاص")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName("message")
      .setDescription("الرسالة التي سيتم إرسالها لجميع الأعضاء")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("image")
      .setDescription("رابط صورة ترفقها مع الرسالة (اختياري)")
      .setRequired(false),
  ) as SlashCommandBuilder;

const execute = async (interaction: ChatInputCommandInteraction) => {
  const message = interaction.options.getString("message", true);
  const imageUrl = interaction.options.getString("image");

  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ هذا الأمر يعمل فقط داخل السيرفر.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guild: Guild = interaction.guild;
  let members: GuildMember[];

  try {
    const fetched = await guild.members.fetch();
    members = [...fetched.values()].filter((m) => !m.user.bot);
  } catch (err) {
    logger.error({ err }, "Failed to fetch guild members");
    await interaction.editReply("❌ فشل في جلب أعضاء السيرفر.");
    return;
  }

  let sent = 0;
  let failed = 0;

  await interaction.editReply(
    `⏳ جاري الإرسال لـ ${members.length} عضو...`,
  );

  for (const member of members) {
    try {
      const dmPayload: Parameters<typeof member.send>[0] = {
        content: message,
      };

      if (imageUrl) {
        dmPayload.files = [imageUrl];
      }

      await member.send(dmPayload);
      sent++;
    } catch {
      failed++;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  await interaction.editReply(
    `✅ انتهى البرودكاست!\n📨 تم الإرسال: **${sent}**\n❌ فشل: **${failed}**`,
  );

  logger.info({ sent, failed, guildId: guild.id }, "Broadcast completed");
};

export const broadcastCommand: BotCommand = { data, execute };
