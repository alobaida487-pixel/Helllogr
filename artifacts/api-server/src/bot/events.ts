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

// --- Publish session store (category selected before opening modal) ---
interface PublishSession {
  category: string;
  categoryLabel: string;
}
const pendingPublishSessions = new Map<string, PublishSession>();

// --- Publish server categories ---
const PUBLISH_CATEGORIES = [
  { label: "🎮 ألعاب فيديو",          value: "games",     description: "GTA، فورتنايت، ماينكرافت..." },
  { label: "🕹️ قيمنق وإستريمنق",     value: "gaming",    description: "قيمرز وستريمرز" },
  { label: "⚔️ ألعاب RPG وفانتازيا",  value: "rpg",       description: "RPG، أنمي، وفانتازيا" },
  { label: "🌐 سيرفر عام",            value: "general",   description: "مجتمعات متنوعة وعامة" },
  { label: "🎨 إبداع وتصميم",         value: "creative",  description: "فن وتصميم وإبداع" },
];

// --- Nitro badge milestones (months) ---
interface BadgeMilestone {
  months: number;
  name: string;
  emoji: string;
  color: number;
}

const NITRO_MILESTONES: BadgeMilestone[] = [
  { months: 1,  name: "Bronze",   emoji: "🟠", color: 0xcd7f32 },
  { months: 3,  name: "Silver",   emoji: "⚪", color: 0xc0c0c0 },
  { months: 6,  name: "Gold",     emoji: "🟡", color: 0xffd700 },
  { months: 12, name: "Platinum", emoji: "🔵", color: 0x00bfff },
  { months: 24, name: "Diamond",  emoji: "💠", color: 0xb9f2ff },
  { months: 36, name: "Emerald",  emoji: "🟢", color: 0x50c878 },
  { months: 60, name: "Ruby",     emoji: "🔴", color: 0xe0115f },
  { months: 72, name: "Opal",     emoji: "🌟", color: 0xa8c5da },
];

// --- Boost badge milestones (months) ---
const BOOST_MILESTONES: BadgeMilestone[] = [
  { months: 1,  name: "مستوى 1",  emoji: "🔷", color: 0x5865f2 },
  { months: 2,  name: "مستوى 2",  emoji: "💠", color: 0x5865f2 },
  { months: 3,  name: "مستوى 3",  emoji: "🔹", color: 0x5865f2 },
  { months: 6,  name: "مستوى 4",  emoji: "⬡",  color: 0x57f287 },
  { months: 9,  name: "مستوى 5",  emoji: "⬡",  color: 0x57f287 },
  { months: 12, name: "مستوى 6",  emoji: "⬡",  color: 0xfee75c },
  { months: 15, name: "مستوى 7",  emoji: "⬡",  color: 0xfee75c },
  { months: 18, name: "مستوى 8",  emoji: "⬡",  color: 0xeb459e },
  { months: 24, name: "مستوى 9",  emoji: "⬡",  color: 0xeb459e },
];

function buildProgressBar(current: number, total: number, width = 12): string {
  const filled = Math.min(width, Math.round((current / total) * width));
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

function monthsToMs(months: number): number {
  return months * 30.44 * 24 * 60 * 60 * 1000;
}

function formatDaysMonths(totalDays: number): string {
  if (totalDays <= 0) return "وصلت!";
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (months > 0 && days > 0) return `${months} شهر و ${days} يوم`;
  if (months > 0) return `${months} شهر`;
  return `${days} يوم`;
}

function addDateString(date: Date, months: number): string {
  const d = new Date(date.getTime() + monthsToMs(months));
  return d.toISOString().split("T")[0]!;
}

function buildBadgeEmbed(
  sinceDate: Date,
  milestones: BadgeMilestone[],
  title: string,
  type: string,
): EmbedBuilder {
  const now = Date.now();
  const elapsedMs = now - sinceDate.getTime();
  const elapsedMonths = elapsedMs / monthsToMs(1);

  let currentBadge: BadgeMilestone | null = null;
  let nextBadge: BadgeMilestone | null = null;

  for (const m of milestones) {
    if (elapsedMonths >= m.months) {
      currentBadge = m;
    } else {
      if (!nextBadge) nextBadge = m;
    }
  }

  const embed = new EmbedBuilder().setTitle(title).setColor(currentBadge?.color ?? 0x5865f2);

  const badgesRow = milestones
    .map((m) => {
      const earned = elapsedMonths >= m.months;
      return earned ? `${m.emoji}` : `▫️`;
    })
    .join(" ");

  const labelRow = milestones
    .map((m) => {
      const mo = m.months >= 12 ? `${m.months / 12}س` : `${m.months}ش`;
      return mo.padEnd(3);
    })
    .join(" ");

  const lines: string[] = [];
  lines.push(`\`\`\`\n${badgesRow}\n${labelRow}\n\`\`\``);

  if (currentBadge) {
    lines.push(`🏅 **الشارة الحالية:** ${currentBadge.emoji} ${currentBadge.name}`);
  } else {
    lines.push(`🏅 **الشارة الحالية:** لا توجد بعد`);
  }

  if (nextBadge) {
    const remainingMonths = nextBadge.months - elapsedMonths;
    const remainingDays = Math.ceil(remainingMonths * 30.44);
    const progressInSegment = elapsedMonths - (currentBadge?.months ?? 0);
    const segmentLength = nextBadge.months - (currentBadge?.months ?? 0);
    const bar = buildProgressBar(progressInSegment, segmentLength);
    const pct = Math.round((progressInSegment / segmentLength) * 100);
    const nextDate = addDateString(sinceDate, nextBadge.months);

    lines.push(`\n📈 **التقدم نحو ${nextBadge.emoji} ${nextBadge.name}:**`);
    lines.push(`\`${bar}\` ${pct}%`);
    lines.push(`⏳ **الوقت المتبقي:** ${formatDaysMonths(remainingDays)}`);
    lines.push(`📅 **التاريخ المتوقع:** \`${nextDate}\``);
  } else {
    lines.push(`\n✨ **وصلت لأعلى شارة! أنت في مستوى ${type} الأقصى.**`);
  }

  embed.setDescription(lines.join("\n"));
  embed.setFooter({ text: "🔒 هذه الرسالة مخفية ولا تظهر إلا لك" });

  return embed;
}

// ─── Ready ────────────────────────────────────────────────────────────────────
client.on(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");
});

// ─── Message Commands ─────────────────────────────────────────────────────────
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
    const member =
      message.guild?.members.cache.get(message.author.id) ??
      (await message.guild?.members.fetch(message.author.id).catch(() => null));
    const isAdmin =
      member?.permissions.has(PermissionFlagsBits.Administrator) ||
      member?.permissions.has(PermissionFlagsBits.ManageMessages);
    if (!isAdmin) return;

    await message.delete().catch(() => undefined);

    const guildId = message.guild?.id ?? "";
    const config = getConfig(guildId);
    const payload: Record<string, unknown> = {};

    if (config.controlImageUrl) {
      payload["embeds"] = [new EmbedBuilder().setImage(config.controlImageUrl).setColor(0x5865f2)];
    } else {
      payload["files"] = [new AttachmentBuilder(CONTROL_IMAGE_PATH, { name: "control-panel.png" })];
    }

    // Row 1 — Ticket menu
    const ticketMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_menu")
      .setPlaceholder("🎫 اضغط هنا للتذكرة")
      .addOptions([
        { label: "Ads",     value: "ticket_ads",     description: "نشر شات ، نشر برودكاست", emoji: "📢" },
        { label: "Inquiry", value: "ticket_inquiry",  description: "استفسار ، اقتراح ، مشكلة", emoji: "❓" },
      ]);

    // Row 2 — Publish categories menu
    const publishMenu = new StringSelectMenuBuilder()
      .setCustomId("publish_category_menu")
      .setPlaceholder("🚀 اضغط هنا للنشر — اختر فئة سيرفرك")
      .addOptions(PUBLISH_CATEGORIES);

    // Row 3 — Badges menu
    const badgesMenu = new StringSelectMenuBuilder()
      .setCustomId("badges_menu")
      .setPlaceholder("🏅 شارات — عرض تقدم شارتك")
      .addOptions([
        { label: "عرض تقدم شارة البوست",  value: "badge_boost",  description: "احسب كم تبقى لشارتك القادمة", emoji: "🔷" },
        { label: "عرض تقدم شارة النيترو", value: "badge_nitro",  description: "تقدمك في شارات النيترو",        emoji: "🌟" },
      ]);

    payload["components"] = [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(ticketMenu),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(publishMenu),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(badgesMenu),
    ];

    if (canSend(message.channel)) await (message.channel as Sendable).send(payload);
    return;
  }
});

// ─── Interactions ─────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction: Interaction) => {

  // ── Ticket menu ──────────────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
    const isAds = interaction.values[0] === "ticket_ads";
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
          `مرحباً ${interaction.user} 👋\n\nتم فتح تذكرة **${typeName}**. سيتواصل معك أحد أعضاء الإدارة قريباً.`,
        );
        await interaction.reply({ content: `✅ تم فتح تذكرتك: ${thread}`, ephemeral: true });
      } catch {
        await interaction.reply({
          content: "❌ فشل في فتح التذكرة. تأكد أن البوت لديه صلاحية **Manage Threads**.",
          ephemeral: true,
        });
      }
    } else {
      await interaction.reply({ content: "❌ هذه القناة لا تدعم إنشاء المواضيع.", ephemeral: true });
    }
    return;
  }

  // ── Publish category selected → save session, show confirm button ────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "publish_category_menu") {
    const value = interaction.values[0]!;
    const found = PUBLISH_CATEGORIES.find((c) => c.value === value);
    const categoryLabel = found?.label ?? value;

    pendingPublishSessions.set(interaction.user.id, { category: value, categoryLabel });

    const confirmBtn = new ButtonBuilder()
      .setCustomId("confirm_publish_btn")
      .setLabel("أدخل رابط الدعوة 🔗")
      .setStyle(ButtonStyle.Primary);

    await interaction.reply({
      content: `✅ اخترت الفئة: **${categoryLabel}**\nاضغط الزر أدناه لإدخال رابط الدعوة:`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn)],
      ephemeral: true,
    });
    return;
  }

  // ── Confirm publish button → show modal ──────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "confirm_publish_btn") {
    const modal = new ModalBuilder().setCustomId("publish_modal").setTitle("معلومات النشر");
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

  // ── Publish modal submit ──────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "publish_modal") {
    const inviteLink = interaction.fields.getTextInputValue("invite_link").trim();
    const match = inviteLink.match(/discord(?:\.gg|app\.com\/invite)\/([a-zA-Z0-9-]+)/i);

    if (!match) {
      await interaction.reply({
        content: "❌ رابط الدعوة غير صالح. مثال: https://discord.gg/abc123",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const session = pendingPublishSessions.get(interaction.user.id);
    pendingPublishSessions.delete(interaction.user.id);
    const categoryLabel = session?.categoryLabel ?? "";

    try {
      const invite = await client.fetchInvite(match[1]!);
      const guild = invite.guild;

      const descParts: string[] = [];
      if (invite.memberCount) descParts.push(`👥 **الأعضاء:** ${invite.memberCount.toLocaleString("ar")}`);
      if (categoryLabel)      descParts.push(`🏷️ **الفئة:** ${categoryLabel}`);

      const embed = new EmbedBuilder()
        .setTitle(guild?.name ?? "سيرفر")
        .setDescription(descParts.join("\n") || null)
        .setColor(0x5865f2);

      const iconUrl = guild?.iconURL({ size: 256 });
      if (iconUrl) embed.setThumbnail(iconUrl);

      const bannerUrl = guild?.bannerURL({ size: 1024 });
      if (bannerUrl) embed.setImage(bannerUrl);

      const joinBtn = new ButtonBuilder()
        .setLabel("دخول السيرفر 🔗")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.gg/${match[1]!}`);

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

      await (adsChannel as Sendable).send({
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      });
      await interaction.editReply(`✅ تم نشر سيرفرك في فئة **${categoryLabel}** بنجاح!`);
    } catch (err) {
      logger.error({ err }, "Failed to fetch invite");
      await interaction.editReply("❌ فشل في جلب معلومات السيرفر. تأكد أن الرابط صالح وغير منتهي الصلاحية.");
    }
    return;
  }

  // ── Badges menu ───────────────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "badges_menu") {
    const value = interaction.values[0];

    if (!interaction.guild) {
      await interaction.reply({ content: "❌ هذا الأمر يعمل فقط داخل السيرفر.", ephemeral: true });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "❌ تعذر جلب معلوماتك.", ephemeral: true });
      return;
    }

    const premiumSince = member.premiumSince;

    if (!premiumSince) {
      const what = value === "badge_nitro" ? "نيترو/بوست" : "بوست";
      await interaction.reply({
        content: `❌ لا يبدو أنك تبوست هذا السيرفر حالياً.\nشارات الـ${what} تعتمد على تاريخ بدء البوست.`,
        ephemeral: true,
      });
      return;
    }

    let embed: EmbedBuilder;
    if (value === "badge_nitro") {
      embed = buildBadgeEmbed(
        premiumSince,
        NITRO_MILESTONES,
        `🌟 تقدم شارة النيترو — ${interaction.user.username}`,
        "نيترو",
      );
    } else {
      embed = buildBadgeEmbed(
        premiumSince,
        BOOST_MILESTONES,
        `🔷 تقدم شارة البوست — ${interaction.user.username}`,
        "بوست",
      );
    }

    embed.setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── Post image download buttons ───────────────────────────────────────────────
  if (interaction.isButton()) {
    const entry = imageStore.get(interaction.customId);

    if (!entry) {
      await interaction.reply({ content: "❌ انتهت صلاحية هذه الصورة.", ephemeral: true });
      return;
    }

    const profileFile = new AttachmentBuilder(entry.profileUrl, { name: "profile.png" });
    const bannerFile = new AttachmentBuilder(entry.bannerUrl, { name: "banner.png" });

    await interaction.reply({ files: [profileFile, bannerFile], ephemeral: true });
    return;
  }

  // ── Slash commands ────────────────────────────────────────────────────────────
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
