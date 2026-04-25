const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    MessageFlags 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const minigameService = require('../../utils/services/minigameService');
const leveling = require('../../utils/services/leveling');
const logger = require('../../utils/core/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restore')
        .setDescription('🏮 Administrative Restoration Protocol: Recovers records from security snapshots.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('exp')
               .setDescription('📈 Recovers Leveling/EXP data from the most recent snapshot.')
        )
        .addSubcommand(sub =>
            sub.setName('arcade')
               .setDescription('🕹️ Recovers Arcade/Minigame points from the most recent snapshot.')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // 1. Locate Latest Snapshot
            const snapshotDir = path.join(__dirname, '../../backups/admin/snapshots');
            if (!fs.existsSync(snapshotDir)) {
                return await interaction.editReply({ content: '❌ **Archival Error:** No security snapshots found in the library.' });
            }

            const files = fs.readdirSync(snapshotDir)
                .filter(f => f.startsWith(subcommand) && f.endsWith('.json'))
                .sort((a, b) => b.localeCompare(a));

            if (files.length === 0) {
                return await interaction.editReply({ content: `❌ **Snapshot Missing:** No previous **${subcommand}** records found to restore.` });
            }

            const latestSnapshot = files[0];
            const snapshotPath = path.join(snapshotDir, latestSnapshot);
            const rawData = fs.readFileSync(snapshotPath, 'utf-8');
            const records = JSON.parse(rawData);

            if (!records || records.length === 0) {
                return await interaction.editReply({ content: `❌ **Corrupted Archive:** The snapshot \`${latestSnapshot}\` contains no valid records.` });
            }

            // 2. Perform Bulk Restoration
            await interaction.editReply({ content: `⏳ **Restoring Archive...** Processing ${records.length} records from \`${latestSnapshot}\`.` });

            if (subcommand === 'exp') {
                await leveling.bulkImportLevels(records);
            } else {
                await minigameService.bulkImportScores(records);
            }

            return await interaction.editReply({ 
                content: `✅ **Restoration Complete.** Successfully recovered ${records.length} records from snapshot \`${latestSnapshot}\`. ♡` 
            });

        } catch (err) {
            logger.error(`[RestoreCommand] Restoration failed for ${subcommand}:`, err);
            return await interaction.editReply({ content: '❌ **Critical Failure:** The restoration protocol encountered a system error.' });
        }
    }
};
