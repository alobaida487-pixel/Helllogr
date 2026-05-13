import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  Collection,
  type ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "../lib/logger.js";

export interface BotCommand {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands = new Collection<string, BotCommand>();

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

export async function registerCommands(commandList: BotCommand[]) {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — skipping command registration");
    return;
  }

  for (const cmd of commandList) {
    commands.set(cmd.data.name, cmd);
  }

  const rest = new REST({ version: "10" }).setToken(token);

  await client.login(token);

  const appId = client.application?.id ?? client.user?.id;
  if (!appId) {
    logger.warn("Could not determine application ID — skipping command registration");
    return;
  }

  await rest.put(Routes.applicationCommands(appId), {
    body: commandList.map((c) => c.data.toJSON()),
  });

  logger.info({ count: commandList.length }, "Slash commands registered globally");
}
