import {
  Events,
  MessageFlags,
  UserFlags,
  type UserFlagsBitField,
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

// ── Deduplication (prevents double-firing) ────────────────────────────────────
const handledMsgs = new Set<string>();
const handledInteractions = new Set<string>();
function dedup(id: string, store: Set<string>): boolean {
  if (store.has(id)) return true;
  store.add(id);
  setTimeout(() => store.delete(id), 15_000);
  return false;
}

// ── Session stores ────────────────────────────────────────────────────────────
const pendingPublish = new Map<string, { category: string; categoryLabel: string }>();
const pendingBadge   = new Map<string, string>(); // userId → "boost"|"nitro"
const pendingEdit    = new Map<string, string>(); // userId → action value
const pendingSearch  = new Map<string, string>(); // userId → action value

// ── Helpers ───────────────────────────────────────────────────────────────────
type Sendable = { send: (opts: unknown) => Promise<unknown> };
function canSend(ch: unknown): ch is Sendable {
  return typeof ch === "object" && ch !== null && "send" in ch;
}

function progressBar(current: number, total: number, width = 12): string {
  const filled = Math.min(width, Math.round((current / total) * width));
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}
function monthsToMs(m: number) { return m * 30.44 * 24 * 60 * 60 * 1000; }
function fmtRemaining(days: number): string {
  if (days <= 0) return "وصلت!";
  const mo = Math.floor(days / 30), d = days % 30;
  if (mo > 0 && d > 0) return `${mo} شهر و ${d} يوم`;
  return mo > 0 ? `${mo} شهر` : `${d} يوم`;
}
function fmtDate(d: Date): string { return d.toISOString().split("T")[0]!; }

// ── Badge milestones ──────────────────────────────────────────────────────────
interface Milestone { months: number; name: string; color: number }
const NITRO_MILESTONES: Milestone[] = [
  { months: 1,  name: "Bronze",   color: 0xcd7f32 },
  { months: 3,  name: "Silver",   color: 0xc0c0c0 },
  { months: 6,  name: "Gold",     color: 0xffd700 },
  { months: 12, name: "Platinum", color: 0x00bfff },
  { months: 24, name: "Diamond",  color: 0xb9f2ff },
  { months: 36, name: "Emerald",  color: 0x50c878 },
  { months: 60, name: "Ruby",     color: 0xe0115f },
  { months: 72, name: "Opal",     color: 0xa8c5da },
];
const BOOST_MILESTONES: Milestone[] = [
  { months: 1,  name: "شهر 1",  color: 0x5865f2 },
  { months: 2,  name: "شهر 2",  color: 0x5865f2 },
  { months: 3,  name: "شهر 3",  color: 0x5865f2 },
  { months: 6,  name: "شهر 6",  color: 0x57f287 },
  { months: 9,  name: "شهر 9",  color: 0x57f287 },
  { months: 12, name: "سنة 1",  color: 0xfee75c },
  { months: 15, name: "شهر 15", color: 0xfee75c },
  { months: 18, name: "شهر 18", color: 0xeb459e },
  { months: 24, name: "سنتان",  color: 0xeb459e },
];

function buildBadgeEmbed(sinceDate: Date, milestones: Milestone[], title: string): EmbedBuilder {
  const elapsedMonths = (Date.now() - sinceDate.getTime()) / monthsToMs(1);
  let cur: Milestone | null = null, nxt: Milestone | null = null;
  for (const m of milestones) {
    if (elapsedMonths >= m.months) cur = m;
    else if (!nxt) nxt = m;
  }

  const timeline = milestones.map((m) => {
    const lbl = m.months >= 12 ? `${m.months / 12}س` : `${m.months}ش`;
    return `${elapsedMonths >= m.months ? "◆" : "◇"} ${lbl}`;
  }).join("  ");

  const lines = [`\`\`\`${timeline}\`\`\``, `الشارة الحالية: ${cur?.name ?? "لا توجد بعد"}`];

  if (nxt) {
    const segStart = cur?.months ?? 0;
    const pct = Math.round(((elapsedMonths - segStart) / (nxt.months - segStart)) * 100);
    const remainDays = Math.ceil((nxt.months - elapsedMonths) * 30.44);
    lines.push(
      `\nالتقدم نحو ${nxt.name}:`,
      `\`${progressBar(elapsedMonths - segStart, nxt.months - segStart)}\` ${pct}%`,
      `الوقت المتبقي: ${fmtRemaining(remainDays)}`,
      `التاريخ المتوقع: \`${fmtDate(new Date(sinceDate.getTime() + monthsToMs(nxt.months)))}\``,
    );
  } else {
    lines.push("\nوصلت لأعلى مستوى!");
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.join("\n"))
    .setColor(cur?.color ?? 0x5865f2)
    .setFooter({ text: "هذه الرسالة مخفية ولا تظهر إلا لك" });
}

// ── Publish categories ────────────────────────────────────────────────────────
const PUBLISH_CATEGORIES = [
  { label: "سيرفرات ألعاب فيديو",   value: "games",   description: "GTA، فورتنايت، ماينكرافت" },
  { label: "سيرفرات قيمنق",         value: "gaming",  description: "قيمرز وستريمرز" },
  { label: "سيرفرات RPG وفانتازيا", value: "rpg",     description: "RPG والأنمي والفانتازيا" },
  { label: "سيرفرات عامة",          value: "general", description: "مجتمعات متنوعة وعامة" },
  { label: "سيرفرات إبداع وتصميم",  value: "creative",description: "فن وتصميم وإبداع" },
];

// ── User flag labels ──────────────────────────────────────────────────────────
const FLAG_LABELS: Partial<Record<string, string>> = {
  Staff:                "موظف ديسكورد",
  Partner:              "شريك ديسكورد",
  CertifiedModerator:   "مشرف معتمد",
  Hypesquad:            "HypeSquad Events",
  HypeSquadOnlineHouse1:"HypeSquad Bravery",
  HypeSquadOnlineHouse2:"HypeSquad Brilliance",
  HypeSquadOnlineHouse3:"HypeSquad Balance",
  PremiumEarlySupporter:"مشترك نيترو قديم",
  ActiveDeveloper:      "مطور نشط",
  BugHunterLevel1:      "صياد أخطاء",
  BugHunterLevel2:      "صياد أخطاء ذهبي",
  VerifiedDeveloper:    "مطور بوت موثق",
};
function getUserBadges(flags: Readonly<UserFlagsBitField> | null): string {
  if (!flags) return "لا توجد";
  const names: string[] = [];
  for (const k of Object.keys(FLAG_LABELS)) {
    if ((k in UserFlags) && flags.has(k as keyof typeof UserFlags)) {
      names.push(FLAG_LABELS[k]!);
    }
  }
  return names.length ? names.join("، ") : "لا توجد";
}

// ─── Error handler ─────────────────────────────────────────────────────────────
client.on(Events.Error, (err) => logger.error({ err }, "Discord client error"));

// ─── Ready ────────────────────────────────────────────────────────────────────
client.on(Events.ClientReady, (rc) => logger.info({ tag: rc.user.tag }, "Discord bot is ready"));

// ─── Message commands ─────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  if (dedup(message.id, handledMsgs)) return;

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

    payload["components"] = [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket_menu")
          .setPlaceholder("اضغط هنا للتذكرة")
          .addOptions([
            { label: "Ads",     value: "ticket_ads",    description: "نشر شات ، نشر برودكاست" },
            { label: "Inquiry", value: "ticket_inquiry", description: "استفسار ، اقتراح ، مشكلة" },
          ]),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("publish_category_menu")
          .setPlaceholder("اضغط هنا للنشر")
          .addOptions(PUBLISH_CATEGORIES),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("badges_menu")
          .setPlaceholder("اضغط هنا للشارات")
          .addOptions([
            { label: "عرض تقدم شارة البوست",  value: "badge_boost", description: "احسب كم تبقى لشارتك القادمة" },
            { label: "عرض تقدم شارة النيترو", value: "badge_nitro", description: "تقدمك في شارات النيترو" },
          ]),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("edit_menu")
          .setPlaceholder("اضغط هنا للتعديل")
          .addOptions([
            { label: "عرض الافتار والبنر لشخص", value: "show_profile", description: "ادخل الايدي لعرض الصور" },
          ]),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("search_menu")
          .setPlaceholder("اضغط هنا للبحث")
          .addOptions([
            { label: "ابحث عن تواجد شخص",   value: "search_presence", description: "الحالة وقناة الصوت والنشاط" },
            { label: "ابحث عن معلومات شخص", value: "search_info",     description: "تاريخ الانضمام والشارات والمزيد" },
          ]),
      ),
    ];

    if (canSend(message.channel)) await (message.channel as Sendable).send(payload);
    return;
  }
});

// ─── Interactions ─────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (dedup(interaction.id, handledInteractions)) return;
  try { await handleInteraction(interaction); }
  catch (err) { logger.error({ err }, "Unhandled interaction error"); }
});

// ─── Main handler ─────────────────────────────────────────────────────────────
async function handleInteraction(interaction: Interaction) {

  // ─ Ticket: open private channel ───────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
    const isAds = interaction.values[0] === "ticket_ads";
    const typeName = isAds ? "اعلانات" : "استفسار";
    if (!interaction.guild) {
      await interaction.reply({ content: "يعمل فقط داخل السيرفر.", flags: MessageFlags.Ephemeral });
      return;
    }
    const config = getConfig(interaction.guild.id);
    try {
      const botMember = interaction.guild.members.me;
      const ch = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase().replace(/\s+/g, "-").slice(0, 25)}`,
        type: ChannelType.GuildText,
        parent: config.ticketCategoryId ?? undefined,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ...(botMember ? [{ id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }] : []),
        ],
      });
      const closeBtn = new ButtonBuilder().setCustomId("close_ticket").setLabel("اغلاق التذكرة").setStyle(ButtonStyle.Danger);
      await ch.send({
        content: `${interaction.user}`,
        embeds: [new EmbedBuilder().setTitle(`تذكرة ${typeName}`).setDescription(`مرحباً ${interaction.user}\nتم فتح تذكرتك. سيتواصل معك أحد أعضاء الإدارة قريباً.\nلإغلاق التذكرة اضغط الزر.`).setColor(0x5865f2).setTimestamp()],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn)],
      });
      await interaction.reply({ content: `تم فتح تذكرتك: ${ch}`, flags: MessageFlags.Ephemeral });
    } catch {
      await interaction.reply({ content: "فشل في إنشاء قناة التذكرة. تأكد أن البوت لديه صلاحية Manage Channels.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // ─ Ticket: close ──────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "close_ticket") {
    const ch = interaction.channel;
    if (!ch || ch.type !== ChannelType.GuildText) return;
    await interaction.reply({ content: "سيتم حذف هذه التذكرة خلال 5 ثوانٍ..." });
    await new Promise((r) => setTimeout(r, 5000));
    await ch.delete("Ticket closed").catch(() => undefined);
    return;
  }

  // ─ Publish: category selected ─────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "publish_category_menu") {
    const value = interaction.values[0]!;
    const found = PUBLISH_CATEGORIES.find((c) => c.value === value);
    pendingPublish.set(interaction.user.id, { category: value, categoryLabel: found?.label ?? value });
    await interaction.reply({
      content: `اخترت الفئة: **${found?.label ?? value}**\nاضغط الزر لإدخال رابط الدعوة:`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("confirm_publish_btn").setLabel("ادخل رابط الدعوة").setStyle(ButtonStyle.Primary))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ─ Publish: open modal ────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "confirm_publish_btn") {
    const modal = new ModalBuilder().setCustomId("publish_modal").setTitle("معلومات النشر");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("invite_link").setLabel("رابط الدعوة").setStyle(TextInputStyle.Short).setPlaceholder("https://discord.gg/xxxxxx").setRequired(true),
    ));
    await interaction.showModal(modal);
    return;
  }

  // ─ Publish: modal submit ──────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "publish_modal") {
    const link = interaction.fields.getTextInputValue("invite_link").trim();
    const match = link.match(/discord(?:\.gg|app\.com\/invite)\/([a-zA-Z0-9-]+)/i);
    if (!match) {
      await interaction.reply({ content: "رابط الدعوة غير صالح. مثال: https://discord.gg/abc123", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const session = pendingPublish.get(interaction.user.id);
    pendingPublish.delete(interaction.user.id);
    try {
      const inv = await client.fetchInvite(match[1]!);
      const g = inv.guild;
      const parts: string[] = [];
      if (inv.memberCount) parts.push(`الأعضاء: ${inv.memberCount.toLocaleString("ar")}`);
      if (session?.categoryLabel) parts.push(`الفئة: ${session.categoryLabel}`);
      const embed = new EmbedBuilder().setTitle(g?.name ?? "سيرفر").setDescription(parts.join("\n") || null).setColor(0x5865f2);
      const icon = g?.iconURL({ size: 256 }); if (icon) embed.setThumbnail(icon);
      const banner = g?.bannerURL({ size: 1024 }); if (banner) embed.setImage(banner);
      const config = getConfig(interaction.guildId ?? "");
      if (!config.adsChannelId) { await interaction.editReply("لم يتم تحديد قناة النشر. استخدم /setup ads_channel أولاً."); return; }
      const adsCh = await client.channels.fetch(config.adsChannelId).catch(() => null);
      if (!adsCh || !canSend(adsCh)) { await interaction.editReply("لم يتم العثور على قناة النشر."); return; }
      await (adsCh as Sendable).send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel("دخول السيرفر").setStyle(ButtonStyle.Link).setURL(`https://discord.gg/${match[1]!}`))] });
      await interaction.editReply(`تم نشر سيرفرك بنجاح في فئة **${session?.categoryLabel ?? ""}**.`);
    } catch (err) {
      logger.error({ err }, "Failed to fetch invite");
      await interaction.editReply("فشل في جلب معلومات السيرفر. تأكد أن الرابط صالح.");
    }
    return;
  }

  // ─ Badges: selected ───────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "badges_menu") {
    const badgeType = interaction.values[0]!; // "badge_boost" | "badge_nitro"
    if (!interaction.guild) { await interaction.reply({ content: "يعمل فقط داخل السيرفر.", flags: MessageFlags.Ephemeral }); return; }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    // If boosting this server, calculate immediately
    if (member?.premiumSince) {
      const milestones = badgeType === "badge_nitro" ? NITRO_MILESTONES : BOOST_MILESTONES;
      const title = badgeType === "badge_nitro" ? `تقدم شارة النيترو — ${interaction.user.username}` : `تقدم شارة البوست — ${interaction.user.username}`;
      const embed = buildBadgeEmbed(member.premiumSince, milestones, title);
      embed.setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
      // Ask user to enter their subscription start date
      pendingBadge.set(interaction.user.id, badgeType);
      await interaction.reply({
        content: "لا يمكن تحديد التاريخ تلقائياً.\nاضغط الزر وأدخل تاريخ بداية اشتراكك أو بوستك:",
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("badge_ask_btn").setLabel("ادخل تاريخ البداية").setStyle(ButtonStyle.Primary))],
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  // ─ Badge: open date modal ─────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "badge_ask_btn") {
    const modal = new ModalBuilder().setCustomId("badge_date_modal").setTitle("تاريخ البداية");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("start_date").setLabel("تاريخ بداية الاشتراك").setStyle(TextInputStyle.Short).setPlaceholder("2024-03-15").setRequired(true),
    ));
    await interaction.showModal(modal);
    return;
  }

  // ─ Badge: date modal submit ───────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "badge_date_modal") {
    const dateStr = interaction.fields.getTextInputValue("start_date").trim();
    const sinceDate = new Date(dateStr);
    if (isNaN(sinceDate.getTime()) || sinceDate > new Date()) {
      await interaction.reply({ content: "تاريخ غير صالح. استخدم الصيغة YYYY-MM-DD مثال: 2024-03-15", flags: MessageFlags.Ephemeral });
      return;
    }
    const badgeType = pendingBadge.get(interaction.user.id) ?? "badge_boost";
    pendingBadge.delete(interaction.user.id);
    const milestones = badgeType === "badge_nitro" ? NITRO_MILESTONES : BOOST_MILESTONES;
    const title = badgeType === "badge_nitro" ? `تقدم شارة النيترو — ${interaction.user.username}` : `تقدم شارة البوست — ${interaction.user.username}`;
    const embed = buildBadgeEmbed(sinceDate, milestones, title);
    embed.setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // ─ Edit: option selected ──────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "edit_menu") {
    pendingEdit.set(interaction.user.id, interaction.values[0]!);
    await interaction.reply({
      content: "اضغط الزر وأدخل الايدي:",
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("edit_ask_btn").setLabel("ادخل الايدي").setStyle(ButtonStyle.Primary))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ─ Edit: open user ID modal ───────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "edit_ask_btn") {
    const modal = new ModalBuilder().setCustomId("edit_userid_modal").setTitle("معرف المستخدم");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("user_id").setLabel("ايدي المستخدم (User ID)").setStyle(TextInputStyle.Short).setPlaceholder("123456789012345678").setRequired(true),
    ));
    await interaction.showModal(modal);
    return;
  }

  // ─ Edit: user ID modal submit ─────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "edit_userid_modal") {
    const userId = interaction.fields.getTextInputValue("user_id").trim();
    pendingEdit.delete(interaction.user.id);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const user = await client.users.fetch(userId, { force: true });
      const avatarUrl = user.displayAvatarURL({ size: 1024, extension: "png" });
      const bannerUrl = user.bannerURL({ size: 1024, extension: "png" });

      const embeds = [
        new EmbedBuilder()
          .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
          .setDescription("الافتار")
          .setImage(avatarUrl)
          .setColor(user.accentColor ?? 0x5865f2),
      ];

      if (bannerUrl) {
        embeds.push(
          new EmbedBuilder()
            .setDescription("البنر")
            .setImage(bannerUrl)
            .setColor(user.accentColor ?? 0x5865f2),
        );
      } else {
        embeds[0]!.setFooter({ text: "لا يوجد بنر لهذا المستخدم" });
      }

      await interaction.editReply({ embeds });
    } catch {
      await interaction.editReply("لم يتم العثور على المستخدم. تأكد من صحة الايدي.");
    }
    return;
  }

  // ─ Search: option selected ────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "search_menu") {
    pendingSearch.set(interaction.user.id, interaction.values[0]!);
    await interaction.reply({
      content: "اضغط الزر وأدخل الايدي:",
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("search_ask_btn").setLabel("ادخل الايدي").setStyle(ButtonStyle.Primary))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ─ Search: open user ID modal ─────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "search_ask_btn") {
    const modal = new ModalBuilder().setCustomId("search_userid_modal").setTitle("ابحث عن مستخدم");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("user_id").setLabel("ايدي المستخدم (User ID)").setStyle(TextInputStyle.Short).setPlaceholder("123456789012345678").setRequired(true),
    ));
    await interaction.showModal(modal);
    return;
  }

  // ─ Search: user ID modal submit ───────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "search_userid_modal") {
    const userId = interaction.fields.getTextInputValue("user_id").trim();
    const action = pendingSearch.get(interaction.user.id) ?? "search_info";
    pendingSearch.delete(interaction.user.id);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const user = await client.users.fetch(userId, { force: true });
      const member = interaction.guild
        ? await interaction.guild.members.fetch(userId).catch(() => null)
        : null;

      if (action === "search_presence") {
        const presence = member?.presence;
        const status = presence?.status ?? "offline";
        const statusLabel: Record<string, string> = { online: "متصل", idle: "بعيد", dnd: "مشغول", offline: "غير متصل", invisible: "غير مرئي" };
        const voiceChannel = member?.voice?.channel?.name ?? "لا يوجد";
        const activities = presence?.activities ?? [];
        const activityLines = activities.map((a) => {
          if (a.type === 1) return `يبث: ${a.url ?? a.name}`;
          if (a.type === 2) return `يستمع إلى: ${a.name}`;
          if (a.type === 3) return `يشاهد: ${a.name}`;
          return `يلعب: ${a.name}`;
        });
        const clientStatus = presence?.clientStatus;
        const devices: string[] = [];
        if (clientStatus?.desktop) devices.push("سطح المكتب");
        if (clientStatus?.mobile) devices.push("الجوال");
        if (clientStatus?.web) devices.push("المتصفح");

        const embed = new EmbedBuilder()
          .setTitle(`تواجد ${user.username}`)
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .setColor(0x5865f2)
          .addFields(
            { name: "الحالة", value: statusLabel[status] ?? status, inline: true },
            { name: "الجهاز", value: devices.length ? devices.join("، ") : "غير معروف", inline: true },
            { name: "قناة الصوت", value: voiceChannel, inline: true },
            { name: "النشاط", value: activityLines.length ? activityLines.join("\n") : "لا يوجد", inline: false },
          );
        await interaction.editReply({ embeds: [embed] });

      } else {
        // search_info
        const badges = getUserBadges(user.flags);
        const premiumLabel: Record<number, string> = { 0: "لا يوجد", 1: "Nitro Classic", 2: "Nitro", 3: "Nitro Basic" };
        const nitro = premiumLabel[(user as { premiumType?: number }).premiumType ?? 0] ?? "لا يوجد";
        const roles = member?.roles.cache
          .filter((r) => r.id !== interaction.guild?.id)
          .sort((a, b) => b.position - a.position)
          .first(5)
          .map((r) => `<@&${r.id}>`)
          .join(" ") ?? "لا يوجد";

        const embed = new EmbedBuilder()
          .setTitle(user.username)
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .setColor(user.accentColor ?? 0x5865f2)
          .addFields(
            { name: "الايدي", value: `\`${user.id}\``, inline: true },
            { name: "نيترو", value: nitro, inline: true },
            { name: "تاريخ إنشاء الحساب", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false },
            { name: "تاريخ الانضمام للسيرفر", value: member?.joinedAt ? `<t:${Math.floor(member.joinedTimestamp! / 1000)}:F>` : "غير معروف", inline: false },
            { name: "الشارات", value: badges, inline: false },
            { name: "الأدوار", value: roles, inline: false },
          );

        const banner = user.bannerURL({ size: 1024, extension: "png" });
        if (banner) embed.setImage(banner);
        await interaction.editReply({ embeds: [embed] });
      }
    } catch {
      await interaction.editReply("لم يتم العثور على المستخدم. تأكد من صحة الايدي.");
    }
    return;
  }

  // ─ Post: image download buttons ──────────────────────────────────────────
  if (interaction.isButton()) {
    const entry = imageStore.get(interaction.customId);
    if (!entry) { await interaction.reply({ content: "انتهت صلاحية هذه الصورة.", flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({
      files: [
        new AttachmentBuilder(entry.profileUrl, { name: "profile.png" }),
        new AttachmentBuilder(entry.bannerUrl,  { name: "banner.png" }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ─ Slash commands ─────────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) { await interaction.reply({ content: "امر غير معروف.", flags: MessageFlags.Ephemeral }); return; }
  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, "Command execution failed");
    const msg = "حدث خطأ أثناء تنفيذ الأمر.";
    if (interaction.replied || interaction.deferred) await interaction.editReply(msg).catch(() => undefined);
    else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
}
