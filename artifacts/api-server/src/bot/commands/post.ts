import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BotCommand } from "../client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VITAL_AVATAR_PATH = path.join(__dirname, "public", "vital-avatar.png");

export interface ImageEntry {
  profileUrl: string;
  bannerUrl: string;
}

export const imageStore = new Map<string, ImageEntry>();

const data = new SlashCommandBuilder()
  .setName("post")
  .setDescription("أرسل صورة بروفايل وبنر مع زر للتحميل")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addAttachmentOption((opt) =>
    opt.setName("profile").setDescription("صورة البروفايل").setRequired(true),
  )
  .addAttachmentOption((opt) =>
    opt.setName("banner").setDescription("صورة البنر").setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("button_label")
      .setDescription("نص الزر (افتراضي: احصل على صورتك)")
      .setRequired(false),
  ) as SlashCommandBuilder;

const execute = async (interaction: ChatInputCommandInteraction) => {
  const profileAttachment = interaction.options.getAttachment("profile", true);
  const bannerAttachment = interaction.options.getAttachment("banner", true);
  const buttonLabel = interaction.options.getString("button_label") ?? "📥 احصل على صورتك";

  for (const att of [profileAttachment, bannerAttachment]) {
    if (!att.contentType?.startsWith("image/")) {
      await interaction.reply({ content: "❌ أحد الملفات المرفقة ليس صورة.", ephemeral: true });
      return;
    }
  }

  const buttonId = `get_image_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  imageStore.set(buttonId, {
    profileUrl: profileAttachment.url,
    bannerUrl: bannerAttachment.url,
  });

  const profileFile = new AttachmentBuilder(profileAttachment.url, { name: "profile.png" });
  const bannerFile = new AttachmentBuilder(bannerAttachment.url, { name: "banner.png" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buttonId)
      .setLabel(buttonLabel)
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    files: [profileFile, bannerFile],
    components: [row],
  });

  const vitalFile = new AttachmentBuilder(VITAL_AVATAR_PATH, { name: "vital-avatar.png" });
  const ch = interaction.channel;
  if (ch && "send" in ch) await (ch as { send: (opts: unknown) => Promise<unknown> }).send({ files: [vitalFile] });
};

export const postCommand: BotCommand = { data, execute };
