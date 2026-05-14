export interface GuildConfig {
  adsChannelId: string;
  controlImageUrl?: string;
}

const DEFAULT_ADS_CHANNEL = "";

const store = new Map<string, GuildConfig>();

export function getConfig(guildId: string): GuildConfig {
  return store.get(guildId) ?? { adsChannelId: DEFAULT_ADS_CHANNEL };
}

export function setConfig(guildId: string, config: Partial<GuildConfig>): void {
  const current = getConfig(guildId);
  store.set(guildId, { ...current, ...config });
}
