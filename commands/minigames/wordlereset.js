const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const wordleService = require('../../utils/services/wordleService');
const logger = require('../../utils/core/logger');

/**
 * Wordle Reset Command: Administrative override to purge the daily cipher.
 * RESTRICTED: Bot Owner Only
 */
module.exports = {
    category: 'minigames',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('wordlereset')
        .setDescription('ADMIN: Forcefully reset the daily wordle cipher and history.'),
    
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 1. Ownership Verification
            if (!interaction.client.application.owner) await interaction.client.application.fetch();
            
            const ownerId = interaction.client.application.owner.id || interaction.client.application.owner.ownerId;
            if (interaction.user.id !== ownerId) {
                return interaction.editReply({ 
                    content: '🔒 **Access Denied.** This protocol is restricted to the Archive Overseer.' 
                });
            }

            // 2. Trigger Nuclear Reset
            await wordleService.forceReset();
            
            logger.warn(`[Admin] Wordle RESET manually triggered by ${interaction.user.tag} (${interaction.user.id})`);
            
            return interaction.editReply({ 
                content: '♻️ **Archive Reset Complete.** Today\'s cipher has been purged and all player history for this solar cycle has been wiped.' 
            });

        } catch (error) {
            logger.error('[WordleReset] Reset failed:', error);
            await interaction.editReply({ 
                content: `❌ **Protocol Failure:** ${error.message}` 
            });
        }
    }
};
