import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { setConfig } from "../config.js";
import { type BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("إعداد البوت للسيرفر")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("ads_channel")
      .setDescription("تحديد قناة نشر السيرفرات")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("القناة التي ستُنشر فيها إعلانات السيرفرات")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("ticket_category")
      .setDescription("تحديد القسم الذي تُنشأ فيه قنوات التذاكر")
      .addChannelOption((opt) =>
        opt
          .setName("category")
          .setDescription("القسم المخصص للتذاكر")
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("control_image")
      .setDescription("تغيير صورة لوحة التحكم")
      .addStringOption((opt) =>
        opt.setName("url").setDescription("رابط الصورة الجديدة").setRequired(true),
      ),
  ) as SlashCommandBuilder;

const execute = async (interaction: ChatInputCommandInteraction) => {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: "❌ هذا الأمر يعمل فقط داخل السيرفر.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "ads_channel") {
    const channel = interaction.options.getChannel("channel", true);
    setConfig(guildId, { adsChannelId: channel.id });
    await interaction.reply({ content: `✅ تم تحديد قناة النشر: <#${channel.id}>`, flags: MessageFlags.Ephemeral });
  } else if (sub === "ticket_category") {
    const category = interaction.options.getChannel("category", true);
    setConfig(guildId, { ticketCategoryId: category.id });
    await interaction.reply({ content: `✅ تم تحديد قسم التذاكر: **${category.name}**`, flags: MessageFlags.Ephemeral });
  } else if (sub === "control_image") {
    const url = interaction.options.getString("url", true);
    setConfig(guildId, { controlImageUrl: url });
    await interaction.reply({ content: "✅ تم تحديث صورة لوحة التحكم.", flags: MessageFlags.Ephemeral });
  }
};

export const setupCommand: BotCommand = { data, execute };
