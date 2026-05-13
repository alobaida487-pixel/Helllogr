import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BotCommand } from "../client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VITAL_AVATAR_PATH = path.join(__dirname, "public", "vital-avatar.png");

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

  const vitalFile = new AttachmentBuilder(VITAL_AVATAR_PATH, { name: "vital-avatar.png" });

  const embedMain = new EmbedBuilder()
    .setDescription(caption)
    .setImage(imageUrl)
    .setColor(0x5865f2);

  const embedBanner = new EmbedBuilder()
    .setImage("attachment://vital-avatar.png");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buttonId)
      .setLabel(buttonLabel)
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    embeds: [embedMain, embedBanner],
    components: [row],
    files: [vitalFile],
  });
};

export const postCommand: BotCommand = { data, execute };
