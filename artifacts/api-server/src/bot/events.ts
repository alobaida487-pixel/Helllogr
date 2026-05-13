import {
  Events,
  type Interaction,
  type Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { client, commands } from "./client.js";
import { logger } from "../lib/logger.js";

const imageStore = new Map<string, string>();

client.on(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const member = message.guild.members.cache.get(message.author.id)
    ?? await message.guild.members.fetch(message.author.id).catch(() => null);

  if (!member) return;

  const isAdmin =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages);

  if (!isAdmin) return;

  const attachment = message.attachments.find((a) => {
    const ct = a.contentType ?? "";
    return ct.startsWith("image/");
  });

  if (!attachment) return;

  const imageUrl = attachment.url;
  const caption = message.content.trim() || "صورك الأصلية:";

  const buttonId = `get_image_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  imageStore.set(buttonId, imageUrl);

  try {
    await message.delete().catch(() => undefined);
  } catch {
  }

  const embed = new EmbedBuilder()
    .setDescription(caption)
    .setImage(imageUrl)
    .setColor(0x5865f2);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buttonId)
      .setLabel("📥 احصل على صورتك")
      .setStyle(ButtonStyle.Primary),
  );

  await message.channel.send({ embeds: [embed], components: [row] });
  logger.info({ imageUrl, channel: message.channelId }, "Image posted with button");
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isButton()) {
    const imageUrl = imageStore.get(interaction.customId);

    if (!imageUrl) {
      await interaction.reply({
        content: "❌ انتهت صلاحية هذه الصورة.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setDescription("هذه صورتك الأصلية 🖼️")
      .setImage(imageUrl)
      .setColor(0x57f287);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);

  if (!command) {
    await interaction.reply({ content: "❌ أمر غير معروف.", ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, "Command execution failed");
    const errorMsg = "❌ حدث خطأ أثناء تنفيذ الأمر.";
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(errorMsg).catch(() => undefined);
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => undefined);
    }
  }
});
