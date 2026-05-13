import {
  Events,
  type Interaction,
  EmbedBuilder,
} from "discord.js";
import { client, commands } from "./client.js";
import { imageStore } from "./commands/post.js";
import { logger } from "../lib/logger.js";

client.on(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");
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
