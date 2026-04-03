const { SlashCommandBuilder, version, MessageFlags } = require('discord.js');
const os = require('os');
const baseEmbed = require('../../utils/generators/baseEmbed');
const supabase = require('../../utils/core/supabaseClient');
const { getGlobalTrackCount } = require('../../utils/services/animeTrackerService');
const { getGlobalBingoCount } = require('../../utils/services/bingoService');
const { getCuteLibrarianTip } = require('../../utils/core/errorHandler');

/**
 * Formats seconds into a human-readable string (Days, Hours, Minutes, Seconds)
 * @param {number} seconds 
 * @returns {string}
 */
const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor(((seconds % 86400) % 3600) / 60);
    const s = Math.floor(((seconds % 86400) % 3600) % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
};

module.exports = {
    category: 'general',
    dbRequired: false,
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('View the live heartrate and status of the library archives.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // 1. Connection Latency
        const ping = interaction.client.ws.ping;
        const pingIcon = ping < 150 ? '🟢' : ping < 300 ? '🟡' : '🔴';

        // 2. Resource Usage
        const memory = process.memoryUsage();
        const heapUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
        const rss = (memory.rss / 1024 / 1024).toFixed(2);

        // 3. Database Health Check
        let dbStatus = '🟢 Operational';
        let dbLatency = 0;
        try {
            const start = Date.now();
            const { error } = await supabase.from('guild_configs').select('guild_id').limit(1);
            dbLatency = Date.now() - start;
            if (error) throw error;
        } catch (e) {
            dbStatus = '🔴 Unstable';
        }

        // 4. Shard Info
        const shardId = interaction.guild.shardId;
        const totalShards = interaction.client.options.shardCount || 1;

        // 5. Library Volume
        const trackedCount = await getGlobalTrackCount();
        const bingoCount = await getGlobalBingoCount();

        const embed = baseEmbed()
            .setTitle('📖 System Diagnostic Complete')
            .setDescription('The archives are responsive and the dust has been cleared. ♡')
            .addFields(
                { name: 'Connection', value: `${pingIcon} ${ping}ms`, inline: true },
                { name: 'Database', value: `${dbStatus} (${dbLatency}ms)`, inline: true },
                { name: 'Memory Usage', value: `Heap: ${heapUsed}MB / RSS: ${rss}MB`, inline: false },
                { name: 'Library Volume', value: `Tracked: ${trackedCount} | Bingo: ${bingoCount}`, inline: false },
                { name: 'System Uptime', value: formatUptime(process.uptime()), inline: true },
                { name: 'Shard Status', value: `Shard ${shardId}/${totalShards}`, inline: true }
            )
            .setColor(dbStatus === '🟢 Operational' ? '#FFACD1' : '#E57373')
            .setFooter({ text: `Archival Note: ${getCuteLibrarianTip()} ♡` });

        await interaction.editReply({ embeds: [embed] });
    },
};
