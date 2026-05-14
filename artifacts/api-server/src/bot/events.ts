import {
  Events,
  MessageFlags,
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

// --- Publish session store ---
interface PublishSession { category: string; categoryLabel: string }
const pendingPublishSessions = new Map<string, PublishSession>();

// --- Publish categories (no emojis) ---
const PUBLISH_CATEGORIES = [
  { label: "سيرفرات ألعاب فيديو",    value: "games",   description: "GTA، فورتنايت، ماينكرافت" },
  { label: "سيرفرات قيمنق",          value: "gaming",  description: "قيمرز وستريمرز" },
  { label: "سيرفرات RPG وفانتازيا",  value: "rpg",     description: "RPG والأنمي والفانتازيا" },
  { label: "سيرفرات عامة",           value: "general", description: "مجتمعات متنوعة وعامة" },
  { label: "سيرفرات إبداع وتصميم",   value: "creative",description: "فن وتصميم وإبداع" },
];

// --- Badge milestones ---
interface BadgeMilestone { months: number; name: string; color: number }

const NITRO_MILESTONES: BadgeMilestone[] = [
  { months: 1,  name: "Bronze",   color: 0xcd7f32 },
  { months: 3,  name: "Silver",   color: 0xc0c0c0 },
  { months: 6,  name: "Gold",     color: 0xffd700 },
  { months: 12, name: "Platinum", color: 0x00bfff },
  { months: 24, name: "Diamond",  color: 0xb9f2ff },
  { months: 36, name: "Emerald",  color: 0x50c878 },
  { months: 60, name: "Ruby",     color: 0xe0115f },
  { months: 72, name: "Opal",     color: 0xa8c5da },
];

const BOOST_MILESTONES: BadgeMilestone[] = [
  { months: 1,  name: "شهر 1",   color: 0x5865f2 },
  { months: 2,  name: "شهر 2",   color: 0x5865f2 },
  { months: 3,  name: "شهر 3",   color: 0x5865f2 },
  { months: 6,  name: "شهر 6",   color: 0x57f287 },
  { months: 9,  name: "شهر 9",   color: 0x57f287 },
  { months: 12, name: "سنة 1",   color: 0xfee75c },
  { months: 15, name: "شهر 15",  color: 0xfee75c },
  { months: 18, name: "شهر 18",  color: 0xeb459e },
  { months: 24, name: "سنتان",   color: 0xeb459e },
];

function monthsToMs(m: number) { return m * 30.44 * 24 * 60 * 60 * 1000; }

function progressBar(current: number, total: number, width = 12): string {
  const filled = Math.min(width, Math.round((current / total) * width));
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

function formatRemaining(totalDays: number): string {
  if (totalDays <= 0) return "وصلت!";
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (months > 0 && days > 0) return `${months} شهر و ${days} يوم`;
  if (months > 0) return `${months} شهر`;
  return `${days} يوم`;
}

function buildBadgeEmbed(sinceDate: Date, milestones: BadgeMilestone[], title: string): EmbedBuilder {
  const elapsedMs = Date.now() - sinceDate.getTime();
  const elapsedMonths = elapsedMs / monthsToMs(1);

  let currentBadge: BadgeMilestone | null = null;
  let nextBadge: BadgeMilestone | null = null;
  for (const m of milestones) {
    if (elapsedMonths >= m.months) currentBadge = m;
    else if (!nextBadge) nextBadge = m;
  }

  const embed = new EmbedBuilder().setTitle(title).setColor(currentBadge?.color ?? 0x5865f2);
  const lines: string[] = [];

  // Badge timeline row
  const badgeRow = milestones.map((m) => {
    const label = m.months >= 12 ? `${m.months / 12}س` : `${m.months}ش`;
    const earned = elapsedMonths >= m.months;
    return `${earned ? "◆" : "◇"} ${label}`;
  }).join("  ");
  lines.push(`\`\`\`${badgeRow}\`\`\``);

  lines.push(`**الشارة الحالية:** ${currentBadge?.name ?? "لا توجد بعد"}`);

  if (nextBadge) {
    const progressInSeg = elapsedMonths - (currentBadge?.months ?? 0);
    const segLen = nextBadge.months - (currentBadge?.months ?? 0);
    const pct = Math.round((progressInSeg / segLen) * 100);
    const remainDays = Math.ceil((nextBadge.months - elapsedMonths) * 30.44);
    const nextDate = new Date(sinceDate.getTime() + monthsToMs(nextBadge.months))
      .toISOString().split("T")[0];

    lines.push(`\n**التقدم نحو ${nextBadge.name}:**`);
    lines.push(`\`${progressBar(progressInSeg, segLen)}\` ${pct}%`);
    lines.push(`**الوقت المتبقي:** ${formatRemaining(remainDays)}`);
    lines.push(`**التاريخ المتوقع:** \`${nextDate}\``);
  } else {
    lines.push("\nوصلت لأعلى مستوى!");
  }

  embed.setDescription(lines.join("\n"));
  embed.setFooter({ text: "هذه الرسالة مخفية ولا تظهر إلا لك" });
  return embed;
}

// ─── Error handler (prevents crash on unhandled Discord errors) ───────────────
client.on(Events.Error, (err) => {
  logger.error({ err }, "Discord client error");
});

// ─── Ready ────────────────────────────────────────────────────────────────────
client.on(Events.ClientReady, (rc) => {
  logger.info({ tag: rc.user.tag }, "Discord bot is ready");
});

// ─── Message commands ─────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();

  if (content === "khat") {
    await message.delete().catch(() => undefined);
    const f = new AttachmentBuilder(VITAL_AVATAR_PATH, { name: "vital-avatar.png" });
    if (canSend(message.channel)) await message.channel.send({ files: [f] });
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

    // Row 1 — Ticket menu (no emojis)
    const ticketMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_menu")
      .setPlaceholder("اضغط هنا للتذكرة")
      .addOptions([
        { label: "Ads",     value: "ticket_ads",     description: "نشر شات ، نشر برودكاست" },
        { label: "Inquiry", value: "ticket_inquiry",  description: "استفسار ، اقتراح ، مشكلة" },
      ]);

    // Row 2 — Publish category menu (no emojis)
    const publishMenu = new StringSelectMenuBuilder()
      .setCustomId("publish_category_menu")
      .setPlaceholder("اضغط هنا للنشر — اختر فئة سيرفرك")
      .addOptions(PUBLISH_CATEGORIES);

    // Row 3 — Badges menu (no emojis)
    const badgesMenu = new StringSelectMenuBuilder()
      .setCustomId("badges_menu")
      .setPlaceholder("شارات — عرض تقدم شارتك")
      .addOptions([
        { label: "عرض تقدم شارة البوست",  value: "badge_boost", description: "احسب كم تبقى لشارتك القادمة" },
        { label: "عرض تقدم شارة النيترو", value: "badge_nitro", description: "تقدمك في شارات النيترو" },
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
  try {
    await handleInteraction(interaction);
  } catch (err) {
    logger.error({ err }, "Unhandled interaction error");
  }
});

async function handleInteraction(interaction: Interaction) {

  // ── Ticket: create private channel ──────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
    const isAds = interaction.values[0] === "ticket_ads";
    const typeName = isAds ? "اعلانات" : "استفسار";

    if (!interaction.guild) {
      await interaction.reply({ content: "❌ يعمل فقط داخل السيرفر.", flags: MessageFlags.Ephemeral });
      return;
    }

    const config = getConfig(interaction.guild.id);

    try {
      const botMember = interaction.guild.members.me;
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase().replace(/\s+/g, "-")}`,
        type: ChannelType.GuildText,
        parent: config.ticketCategoryId ?? undefined,
        permissionOverwrites: [
          { id: interaction.guild.id,   deny:  [PermissionFlagsBits.ViewChannel] },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          ...(botMember ? [{
            id: botMember.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          }] : []),
        ],
      });

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`تذكرة ${typeName}`)
        .setDescription(
          `مرحباً ${interaction.user}\n\nتم فتح تذكرتك من نوع **${typeName}**.\nسيتواصل معك أحد أعضاء الإدارة قريباً.\n\nلإغلاق التذكرة اضغط الزر أدناه.`
        )
        .setColor(0x5865f2)
        .setTimestamp();

      const closeBtn = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("اغلاق التذكرة")
        .setStyle(ButtonStyle.Danger);

      await ticketChannel.send({
        content: `${interaction.user}`,
        embeds: [welcomeEmbed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn)],
      });

      await interaction.reply({
        content: `تم فتح تذكرتك: ${ticketChannel}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content: "❌ فشل في إنشاء قناة التذكرة. تأكد أن البوت لديه صلاحية **Manage Channels**.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  // ── Close ticket ─────────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "close_ticket") {
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) return;

    await interaction.reply({ content: "سيتم حذف هذه التذكرة خلال 5 ثوانٍ..." });
    await new Promise((r) => setTimeout(r, 5000));
    await channel.delete("Ticket closed").catch(() => undefined);
    return;
  }

  // ── Publish: select category → show confirm button ───────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "publish_category_menu") {
    const value = interaction.values[0]!;
    const found = PUBLISH_CATEGORIES.find((c) => c.value === value);
    const categoryLabel = found?.label ?? value;

    pendingPublishSessions.set(interaction.user.id, { category: value, categoryLabel });

    const confirmBtn = new ButtonBuilder()
      .setCustomId("confirm_publish_btn")
      .setLabel("ادخل رابط الدعوة")
      .setStyle(ButtonStyle.Primary);

    await interaction.reply({
      content: `اخترت الفئة: **${categoryLabel}**\nاضغط الزر أدناه لإدخال رابط الدعوة:`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Publish: confirm button → open modal ─────────────────────────────────────
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

  // ── Publish: modal submit ────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "publish_modal") {
    const inviteLink = interaction.fields.getTextInputValue("invite_link").trim();
    const match = inviteLink.match(/discord(?:\.gg|app\.com\/invite)\/([a-zA-Z0-9-]+)/i);

    if (!match) {
      await interaction.reply({
        content: "❌ رابط الدعوة غير صالح. مثال: https://discord.gg/abc123",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const session = pendingPublishSessions.get(interaction.user.id);
    pendingPublishSessions.delete(interaction.user.id);
    const categoryLabel = session?.categoryLabel ?? "";

    try {
      const invite = await client.fetchInvite(match[1]!);
      const guild = invite.guild;

      const descParts: string[] = [];
      if (invite.memberCount) descParts.push(`الأعضاء: ${invite.memberCount.toLocaleString("ar")}`);
      if (categoryLabel)      descParts.push(`الفئة: ${categoryLabel}`);

      const embed = new EmbedBuilder()
        .setTitle(guild?.name ?? "سيرفر")
        .setDescription(descParts.join("\n") || null)
        .setColor(0x5865f2);

      const iconUrl = guild?.iconURL({ size: 256 });
      if (iconUrl) embed.setThumbnail(iconUrl);
      const bannerUrl = guild?.bannerURL({ size: 1024 });
      if (bannerUrl) embed.setImage(bannerUrl);

      const joinBtn = new ButtonBuilder()
        .setLabel("دخول السيرفر")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.gg/${match[1]!}`);

      const config = getConfig(interaction.guildId ?? "");
      if (!config.adsChannelId) {
        await interaction.editReply("❌ لم يتم تحديد قناة النشر. استخدم `/setup ads_channel` أولاً.");
        return;
      }

      const adsChannel = await client.channels.fetch(config.adsChannelId).catch(() => null);
      if (!adsChannel || !canSend(adsChannel)) {
        await interaction.editReply("❌ لم يتم العثور على قناة النشر أو البوت ليس لديه صلاحية الإرسال.");
        return;
      }

      await (adsChannel as Sendable).send({
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
      });
      await interaction.editReply(`تم نشر سيرفرك في فئة **${categoryLabel}** بنجاح.`);
    } catch (err) {
      logger.error({ err }, "Failed to fetch invite");
      await interaction.editReply("❌ فشل في جلب معلومات السيرفر. تأكد أن الرابط صالح وغير منتهي الصلاحية.");
    }
    return;
  }

  // ── Badges ───────────────────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "badges_menu") {
    const value = interaction.values[0];
    if (!interaction.guild) {
      await interaction.reply({ content: "❌ يعمل فقط داخل السيرفر.", flags: MessageFlags.Ephemeral });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "❌ تعذر جلب معلوماتك.", flags: MessageFlags.Ephemeral });
      return;
    }

    const premiumSince = member.premiumSince;
    if (!premiumSince) {
      await interaction.reply({
        content:
          "❌ لا يمكن حساب تقدم شارتك.\n" +
          "شارات البوست والنيترو تُحسب بناءً على تاريخ البوست في هذا السيرفر.\n" +
          "لكي تعمل هذه الميزة يجب أن تكون بوستر في هذا السيرفر.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const isNitro = value === "badge_nitro";
    const embed = buildBadgeEmbed(
      premiumSince,
      isNitro ? NITRO_MILESTONES : BOOST_MILESTONES,
      isNitro
        ? `تقدم شارة النيترو — ${interaction.user.username}`
        : `تقدم شارة البوست — ${interaction.user.username}`,
    );
    embed.setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Post: image download buttons ─────────────────────────────────────────────
  if (interaction.isButton()) {
    const entry = imageStore.get(interaction.customId);
    if (!entry) {
      await interaction.reply({ content: "❌ انتهت صلاحية هذه الصورة.", flags: MessageFlags.Ephemeral });
      return;
    }
    const profileFile = new AttachmentBuilder(entry.profileUrl, { name: "profile.png" });
    const bannerFile  = new AttachmentBuilder(entry.bannerUrl,  { name: "banner.png" });
    await interaction.reply({ files: [profileFile, bannerFile], flags: MessageFlags.Ephemeral });
    return;
  }

  // ── Slash commands ────────────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: "❌ أمر غير معروف.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, "Command execution failed");
    const msg = "❌ حدث خطأ أثناء تنفيذ الأمر.";
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(msg).catch(() => undefined);
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
}
