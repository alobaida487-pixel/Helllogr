import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../client.js";

export const imageStore = new Map<string, string>();

const data = new SlashCommandBuilder()
  .setName("post")
  .setDescription("أرسل صورة مع زر يعطي الضاغط الصورة بخاص")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addAttachmentOption((opt) =>
    opt
      .setName("image")
      .setDescription("الصورة التي تريد نشرها")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("caption")
      .setDescription("نص يظهر فوق الصورة (اختياري)")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("button_label")
      .setDescription("نص الزر (افتراضي: احصل على صورتك)")
      .setRequired(false),
  ) as SlashCommandBuilder;

const execute = async (interaction: ChatInputCommandInteraction) => {
  const attachment = interaction.options.getAttachment("image", true);
  const caption = interaction.options.getString("caption") ?? "صورك الأصلية:";
  const buttonLabel = interaction.options.getString("button_label") ?? "📥 احصل على صورتك";

  const ct = attachment.contentType ?? "";
  if (!ct.startsWith("image/")) {
    await interaction.reply({
      content: "❌ الملف المرفق ليس صورة. أرفق صورة بصيغة PNG أو JPG أو GIF.",
      ephemeral: true,
    });
    return;
  }

  const imageUrl = attachment.url;
  const buttonId = `get_image_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  imageStore.set(buttonId, imageUrl);

  const embed = new EmbedBuilder()
    .setDescription(caption)
    .setImage(imageUrl)
    .setColor(0x5865f2);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buttonId)
      .setLabel(buttonLabel)
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
};

export const postCommand: BotCommand = { data, execute };
