import {
  Events,
  type Interaction,
  type Message,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { client, commands } from "./client.js";
import { imageStore } from "./commands/post.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VITAL_AVATAR_PATH = path.join(__dirname, "public", "vital-avatar.png");

client.on(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  if (message.content.trim().toLowerCase() !== "khat") return;

  try {
    await message.delete().catch(() => undefined);
    const vitalFile = new AttachmentBuilder(VITAL_AVATAR_PATH, { name: "vital-avatar.png" });
    if ("send" in message.channel) await (message.channel as { send: (opts: unknown) => Promise<unknown> }).send({ files: [vitalFile] });
  } catch (err) {
    logger.error({ err }, "Failed to send khat");
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isButton()) {
    const entry = imageStore.get(interaction.customId);

    if (!entry) {
      await interaction.reply({
        content: "❌ انتهت صلاحية هذه الصورة.",
        ephemeral: true,
      });
      return;
    }

    const embedProfile = new EmbedBuilder()
      .setDescription("🖼️ صورة البروفايل:")
      .setImage(entry.profileUrl)
      .setColor(0x57f287);

    const embedBanner = new EmbedBuilder()
      .setDescription("🖼️ صورة البنر:")
      .setImage(entry.bannerUrl)
      .setColor(0x57f287);

    await interaction.reply({
      embeds: [embedProfile],
      ephemeral: true,
    });

    await interaction.followUp({
      embeds: [embedBanner],
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
