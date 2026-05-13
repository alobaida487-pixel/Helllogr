import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("send")
  .setDescription("أرسل صورة مع زر في قناة")
  .addStringOption((opt) =>
    opt
      .setName("image")
      .setDescription("رابط الصورة (URL)")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("caption")
      .setDescription("نص توضيحي يظهر فوق الصورة")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("button_label")
      .setDescription("نص الزر (الافتراضي: صورك الأصلية)")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("button_url")
      .setDescription("رابط الزر (اختياري)")
      .setRequired(false),
  ) as SlashCommandBuilder;

const execute = async (interaction: ChatInputCommandInteraction) => {
  const imageUrl = interaction.options.getString("image", true);
  const caption = interaction.options.getString("caption") ?? "صورك الأصلية:";
  const buttonLabel = interaction.options.getString("button_label") ?? "📥 تحميل الصورة";
  const buttonUrl = interaction.options.getString("button_url");

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  if (!isValidUrl(imageUrl)) {
    await interaction.reply({
      content: "❌ رابط الصورة غير صالح. تأكد من إدخال رابط URL صحيح.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setDescription(caption)
    .setImage(imageUrl)
    .setColor(0x5865f2);

  const row = new ActionRowBuilder<ButtonBuilder>();

  if (buttonUrl && isValidUrl(buttonUrl)) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel(buttonLabel)
        .setStyle(ButtonStyle.Link)
        .setURL(buttonUrl),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setLabel(buttonLabel)
        .setStyle(ButtonStyle.Link)
        .setURL(imageUrl),
    );
  }

  await interaction.reply({
    embeds: [embed],
    components: [row],
  });
};

export const sendCommand: BotCommand = { data, execute };
