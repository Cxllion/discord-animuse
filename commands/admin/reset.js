const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const minigameService = require('../../utils/services/minigameService');
const wordleService = require('../../utils/services/wordleService');
const leveling = require('../../utils/services/leveling');
const baseEmbed = require('../../utils/generators/baseEmbed');
const logger = require('../../utils/core/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('🏮 Administrative Reset Protocol: Wipes specific archival records.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('wordle')
               .setDescription('♻️ Cycles the Daily Wordle archive and reverses today\'s points.')
        )
        .addSubcommand(sub =>
            sub.setName('exp')
               .setDescription('📉 Resets Leveling/EXP data.')
               .addUserOption(opt => opt.setName('user').setDescription('The patron to reset (Leave empty for GLOBAL wipe)'))
        )
        .addSubcommand(sub =>
            sub.setName('arcade')
               .setDescription('🕹️ Resets Arcade/Minigame leaderboard points.')
               .addUserOption(opt => opt.setName('user').setDescription('The patron to reset (Leave empty for GLOBAL wipe)'))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');

        // --- 1. Wordle Reset (Individual Flow) ---
        if (subcommand === 'wordle') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            try {
                const previousWord = await wordleService.forceReset(interaction.client);
                return await interaction.editReply({
                    content: `✅ **Wordle Archive Cycled.** The key **${previousWord}** has been retired. Today's rewards have been reversed, and a new cipher is now active. ♡`
                });
            } catch (err) {
                logger.error('[ResetCommand] Wordle reset failed:', err);
                return await interaction.editReply({ content: '❌ **Protocol Error:** Failed to cycle the Wordle archives.' });
            }
        }

        // --- 2. EXP & Arcade Resets (Confirmation Required for Global) ---
        if (!targetUser) {
            // GLOBAL WIPE FLOW
            const type = subcommand === 'exp' ? 'LIBRARY EXP' : 'ARCADE LEADERBOARD';
            const embed = baseEmbed(
                '⚠️ HIGH-SECURITY CLEARANCE REQUIRED',
                `You are about to initiate a **GLOBAL ${type} WIPE**.\n\nThis will permanently set the records for **ALL patrons** in this guild to zero. This action is **irreversible** (unless recovered from a security snapshot).`
            ).setColor('#ff0000');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('local_reset_confirm')
                    .setLabel(`CONFIRM GLOBAL ${subcommand.toUpperCase()} WIPE`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('local_reset_cancel')
                    .setLabel('CANCEL')
                    .setStyle(ButtonStyle.Secondary)
            );

            const response = await interaction.reply({
                embeds: [embed],
                components: [row],
                flags: [MessageFlags.Ephemeral]
            });

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 30000
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '❌ Only the initiating archivist can confirm this protocol. ♡', flags: [MessageFlags.Ephemeral] });
                }

                if (i.customId === 'local_reset_cancel') {
                    await i.update({ content: '❌ **Protocol Aborted.** Archival records remain untouched. ♡', embeds: [], components: [] });
                    return collector.stop();
                }

                if (i.customId === 'local_reset_confirm') {
                    await i.update({ content: '⏳ **Creating Security Snapshot...**', embeds: [], components: [] });
                    
                    try {
                        const timestamp = Date.now();
                        const snapshotId = `${subcommand}_${timestamp}`;
                        const snapshotPath = path.join(__dirname, '../../backups/admin/snapshots', `${snapshotId}.json`);

                        let dataToBackup = [];
                        if (subcommand === 'exp') {
                            dataToBackup = await leveling.getAllLevels(interaction.guildId);
                        } else {
                            dataToBackup = await minigameService.getAllScores();
                        }

                        if (dataToBackup.length > 0) {
                            const dir = path.dirname(snapshotPath);
                            if (!fs.existsSync(dir)) {
                                await fs.promises.mkdir(dir, { recursive: true });
                            }
                            await fs.promises.writeFile(snapshotPath, JSON.stringify(dataToBackup, null, 2));
                        }

                        await i.editReply({ content: `⏳ **Nuclear Wipe in Progress...** (Snapshot Created: \`${snapshotId}\`)` });
                        
                        if (subcommand === 'exp') {
                            await leveling.resetAllLevels(interaction.guildId);
                        } else {
                            await minigameService.resetAllPoints();
                        }

                        await i.editReply({ content: `✅ **Wipe Complete.** Records have been synchronized to zero. Snapshot \`${snapshotId}\` is available for recovery via \`/restore\`. ♡` });
                    } catch (err) {
                        logger.error('[ResetCommand] Global wipe failed:', err);
                        await i.editReply({ content: '❌ **Protocol Error:** Critical failure during nuclear wipe sequence.' });
                    }
                    return collector.stop();
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction.editReply({ content: '⌛ **Confirmation Timeout.** Reset protocol deactivated for security.', embeds: [], components: [] }).catch(() => null);
                }
            });

        } else {
            // TARGETED USER RESET
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            
            if (subcommand === 'exp') {
                await leveling.resetUserLevel(targetUser.id, interaction.guildId);
                return await interaction.editReply({ content: `✅ **EXP Synced.** <@${targetUser.id}>'s leveling records have been cleared. ♡` });
            } else {
                await minigameService.resetUserPoints(targetUser.id);
                return await interaction.editReply({ content: `✅ **Arcade Synced.** <@${targetUser.id}>'s leaderboard points have been cleared. ♡` });
            }
        }
    }
};
