import {
  Events,
  type Interaction,
  type Message,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  ThreadAutoArchiveDuration,
  PermissionFlagsBits,
} from "discord.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { client, commands } from "./client.js";
import { imageStore } from "./commands/post.js";
import { getConfig } from "./config.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VITAL_AVATAR_PATH = path.join(__dirname, "public", "vital-avatar.png");
const CONTROL_IMAGE_PATH = path.join(__dirname, "public", "control-panel.png");

type Sendable = { send: (opts: unknown) => Promise<unknown> };

function canSend(ch: unknown): ch is Sendable {
  return typeof ch === "object" && ch !== null && "send" in ch;
}

client.on(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (content === "khat") {
    await message.delete().catch(() => undefined);
    const vitalFile = new AttachmentBuilder(VITAL_AVATAR_PATH, { name: "vital-avatar.png" });
    if (canSend(message.channel)) await message.channel.send({ files: [vitalFile] });
    return;
  }

  if (content === "!control") {
    const member = message.guild?.members.cache.get(message.author.id)
      ?? await message.guild?.members.fetch(message.author.id).catch(() => null);
    const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator)
      || member?.permissions.has(PermissionFlagsBits.ManageMessages);
    if (!isAdmin) return;

    await message.delete().catch(() => undefined);

    const guildId = message.guild?.id ?? "";
    const config = getConfig(guildId);
    const messagePayload: Record<string, unknown> = {};

    if (config.controlImageUrl) {
      const embed = new EmbedBuilder().setImage(config.controlImageUrl).setColor(0x5865f2);
      messagePayload["embeds"] = [embed];
    } else {
      const controlFile = new AttachmentBuilder(CONTROL_IMAGE_PATH, { name: "control-panel.png" });
      messagePayload["files"] = [controlFile];
    }

    const ticketMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_menu")
      .setPlaceholder("🎫 اضغط هنا للتذكرة")
      .addOptions([
        {
          label: "Ads",
          value: "ticket_ads",
          description: "نشر شات ، نشر برودكاست",
          emoji: "📢",
        },
        {
          label: "Inquiry",
          value: "ticket_inquiry",
          description: "استفسار ، اقتراح ، مشكلة",
          emoji: "❓",
        },
      ]);

    const publishButton = new ButtonBuilder()
      .setCustomId("open_publish_modal")
      .setLabel("اضغط هنا للنشر 🚀")
      .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(ticketMenu);
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(publishButton);

    messagePayload["components"] = [row1, row2];

    if (canSend(message.channel)) {
      await (message.channel as Sendable).send(messagePayload);
    }
    return;
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {

  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
    const value = interaction.values[0];
    const isAds = value === "ticket_ads";
    const typeName = isAds ? "إعلانات" : "استفسار";

    const channel = interaction.channel;
    if (
      channel &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) &&
      "threads" in channel
    ) {
      try {
        const thread = await channel.threads.create({
          name: `تذكرة-${typeName}-${interaction.user.username}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          reason: `Ticket by ${interaction.user.tag}`,
        });
        await thread.members.add(interaction.user.id);
        await thread.send(
          `مرحباً ${interaction.user} 👋\n\nتم فتح تذكرة **${typeName}**. سيتواصل معك أحد أعضاء الإدارة قريباً.`
        );
        await interaction.reply({ content: `✅ تم فتح تذكرتك: ${thread}`, ephemeral: true });
      } catch {
        await interaction.reply({ content: "❌ فشل في فتح التذكرة. تأكد أن البوت عنده صلاحية **Manage Threads**.", ephemeral: true });
      }
    } else {
      await interaction.reply({ content: "❌ هذه القناة لا تدعم إنشاء المواضيع.", ephemeral: true });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "open_publish_modal") {
    const modal = new ModalBuilder()
      .setCustomId("publish_modal")
      .setTitle("معلومات النشر");

    const inviteInput = new TextInputBuilder()
      .setCustomId("invite_link")
      .setLabel("رابط الدعوة")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://discord.gg/xxxxxx")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(inviteInput));
    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "publish_modal") {
    const inviteLink = interaction.fields.getTextInputValue("invite_link").trim();
    const match = inviteLink.match(/discord(?:\.gg|app\.com\/invite)\/([a-zA-Z0-9-]+)/i);

    if (!match) {
      await interaction.reply({ content: "❌ رابط الدعوة غير صالح. أدخل رابطاً مثل: https://discord.gg/abc123", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const invite = await client.fetchInvite(match[1]);
      const guild = invite.guild;

      const embed = new EmbedBuilder()
        .setTitle(guild?.name ?? "سيرفر")
        .setColor(0x5865f2);

      if (invite.memberCount) {
        embed.setDescription(`👥 **الأعضاء:** ${invite.memberCount.toLocaleString("ar")}`);
      }

      const iconUrl = guild?.iconURL({ size: 256 });
      if (iconUrl) embed.setThumbnail(iconUrl);

      const bannerUrl = guild?.bannerURL({ size: 1024 });
      if (bannerUrl) embed.setImage(bannerUrl);

      const joinButton = new ButtonBuilder()
        .setLabel("دخول السيرفر 🔗")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.gg/${match[1]}`);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton);

      const config = getConfig(interaction.guildId ?? "");
      if (!config.adsChannelId) {
        await interaction.editReply("❌ لم يتم تحديد قناة النشر. استخدم `/setup ads_channel` أولاً.");
        return;
      }

      const adsChannel = await client.channels.fetch(config.adsChannelId).catch(() => null);
      if (!adsChannel || !canSend(adsChannel)) {
        await interaction.editReply("❌ لم يتم العثور على قناة النشر أو البوت ليس لديه صلاحية الإرسال فيها.");
        return;
      }

      await (adsChannel as Sendable).send({ embeds: [embed], components: [row] });
      await interaction.editReply("✅ تم نشر سيرفرك بنجاح!");
    } catch (err) {
      logger.error({ err }, "Failed to fetch invite");
      await interaction.editReply("❌ فشل في جلب معلومات السيرفر. تأكد أن الرابط صالح وغير منتهي الصلاحية.");
    }
    return;
  }

  if (interaction.isButton()) {
    const entry = imageStore.get(interaction.customId);

    if (!entry) {
      await interaction.reply({ content: "❌ انتهت صلاحية هذه الصورة.", ephemeral: true });
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

    await interaction.reply({ embeds: [embedProfile], ephemeral: true });
    await interaction.followUp({ embeds: [embedBanner], ephemeral: true });
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
