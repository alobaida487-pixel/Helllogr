import "./events.js";
import { registerCommands } from "./client.js";
import { broadcastCommand } from "./commands/broadcast.js";
import { postCommand } from "./commands/post.js";
import { logger } from "../lib/logger.js";

export async function startBot() {
  const enabled = process.env["DISCORD_ENABLED"];
  const token = process.env["DISCORD_BOT_TOKEN"];

  if (!enabled || enabled === "false") {
    logger.info("DISCORD_ENABLED is not set — bot will not start");
    return;
  }

  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN is missing — bot will not start");
    return;
  }

  try {
    await registerCommands([postCommand, broadcastCommand]);
    logger.info("Discord bot started successfully");
  } catch (err) {
    logger.error({ err }, "Failed to start Discord bot");
  }
}
