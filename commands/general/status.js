const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const os = require('os');
const baseEmbed = require('../../utils/generators/baseEmbed');
const supabase = require('../../utils/core/supabaseClient');
const cacheManager = require('../../utils/core/CacheManager');
const { getAniListStatus } = require('../../utils/services/anilistService');
const { getGlobalTrackCount } = require('../../utils/services/animeTrackerService');
const { getCuteLibrarianTip } = require('../../utils/core/errorHandler');

const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor(((seconds % 86400) % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${s}s`;
};

module.exports = {
    category: 'general',
    dbRequired: false,
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('View the live heartrate and status of the library archives.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // 1. Core Latency
        const ping = interaction.client.ws.ping;
        const pingIcon = ping < 150 ? '🟢' : ping < 300 ? '🟡' : '🔴';

        // 2. Resource Usage
        const memory = process.memoryUsage();
        const heapUsed = (memory.heapUsed / 1024 / 1024).toFixed(1);
        const rss = (memory.rss / 1024 / 1024).toFixed(1);

        // 3. Database & Cache
        let dbLatency = 'N/A';
        try {
            const start = Date.now();
            await supabase.from('guild_configs').select('guild_id').limit(1);
            dbLatency = `${Date.now() - start}ms`;
        } catch (e) {}

        const cacheStats = cacheManager.getStats();
        const totalKeys = Object.values(cacheStats).reduce((acc, s) => acc + s.keys, 0);

        // 4. AniList Health
        const alStatus = getAniListStatus();
        const alLabel = alStatus.isCircuitBroken ? '🔴 BROKEN' : (alStatus.isMaintenance ? '🟡 MAINT' : '🟢 OK');

        // 5. Task Scheduler
        const tasks = interaction.client.scheduler.getTelemetry();
        const activeTasks = tasks.filter(t => t.status === 'RUNNING').length;

        // 6. Volume
        const trackedCount = await getGlobalTrackCount().catch(() => 0);

        const embed = baseEmbed('📖 System Diagnostic Complete', 'The archives are responsive and the dust has been cleared. ♡')
            .addFields(
                { name: 'Connection', value: `${pingIcon} ${ping}ms`, inline: true },
                { name: 'Database', value: `🟢 ${dbLatency}`, inline: true },
                { name: 'AniList API', value: alLabel, inline: true },
                
                { name: 'Memory Pulse', value: `Heap: ${heapUsed}MB / RSS: ${rss}MB`, inline: false },
                
                { name: 'Cache & Storage', value: `Keys: ${totalKeys} | Tracked: ${trackedCount}`, inline: true },
                { name: 'Scheduler', value: `Active: ${activeTasks}/${tasks.length}`, inline: true },
                
                { name: 'System Uptime', value: formatUptime(process.uptime()), inline: true },
                { name: 'Shard Status', value: `Shard ${interaction.guild.shardId + 1}/${interaction.client.shardCount || 1}`, inline: true }
            )
            .setColor(alStatus.isCircuitBroken ? '#E57373' : '#FFACD1')
            .setFooter({ text: `Archival Note: ${getCuteLibrarianTip()} ♡` });

        await interaction.editReply({ embeds: [embed] });
    },
};
