const MafiaManager = require('../mafia/MafiaManager');
const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const handleMafiaInteraction = async (interaction) => {
    // 1. EXTRACT LOBBY ID ROBUSTLY
    const parts = interaction.customId.split('_');
    let lobbyId = null;

    // The hostId is typically the first 17-20 digit numeric string in the ID
    // or follows a specific sequence.
    // Standard format: [prefix]_[action]_[hostId]_[optional_targetId]
    
    if (interaction.customId.includes('_vote_')) {
        // mafia_vote_123456789_target OR archive_vote_...
        lobbyId = parts[2];
    } else if (interaction.customId.includes('_night_target_')) {
        // mafia_night_target_123456789 OR archive_night_target_...
        lobbyId = parts[3];
    } else if (interaction.customId.startsWith('mafia_setphase_val_')) {
        lobbyId = parts[3];
    } else if (interaction.customId.startsWith('mafia_setphase_cat_')) {
        lobbyId = parts[3];
    } else if (parts[0] === 'mafia' || parts[0] === 'archive') {
        // Default: use the 3rd or 2nd part, but be careful with many parts
        // Find the first part that looks like a snowflake
        const found = parts.find(p => /^\d{17,20}$/.test(p));
        if (found) lobbyId = found;
        else lobbyId = parts[2] || parts[1];
    }

    // Double check that lobbyId looks like a Discord snowflake
    if (lobbyId && !/^\d{17,20}$/.test(lobbyId)) {
        // If not a snowflake, search all parts for one
        const found = parts.find(p => /^\d{17,20}$/.test(p));
        if (found) lobbyId = found;
    }
    
    // ═══════════════════════════════════════
    // GLOBAL INTERACTIONS (No Game Required)
    // ═══════════════════════════════════════
    
    // Survival Guide Select Menu
    if (interaction.customId === 'mafia_help_menu') {
        const page = interaction.values[0];
        try {
            return await interaction.update(require('../mafia/MafiaUI').buildSurvivalGuide(page));
        } catch (e) {
            console.error('Help menu update failed:', e);
            return;
        }
    }

    // Survival Guide General Button (Lobby)
    if (interaction.customId.startsWith('mafia_help_general_')) {
        const { buildSurvivalGuide } = require('../mafia/MafiaUI');
        return await interaction.reply(buildSurvivalGuide());
    }

    const game = MafiaManager.getGameByLobby(lobbyId) || MafiaManager.getGameByThread(interaction.channelId);

    if (!game) {
        return await interaction.reply({ 
            content: '❌ **Session Redacted.** This game session no longer exists or has expired. Use `/mafia host` to start a new one if the archives are clear.', 
            flags: MessageFlags.Ephemeral 
        });
    }

    // ═══════════════════════════════════════
    // BUTTONS
    // ═══════════════════════════════════════
    if (interaction.isButton()) {

        // Access Terminal (lobby button)
        if (interaction.customId.startsWith('mafia_access_')) {
            const { buildActionHub } = require('../mafia/MafiaUI');
            return await interaction.reply(buildActionHub(game, interaction.user));
        }

        // Join Button (from Action Hub)
        if (interaction.customId.startsWith('mafia_join_')) {
            await interaction.deferUpdate();
            if (game.addPlayer(interaction.user)) {
                const { buildActionHub } = require('../mafia/MafiaUI');
                await interaction.editReply(buildActionHub(game, interaction.user));
                await game.refreshLobby(interaction.channel);
            } else {
                await interaction.followUp({ content: 'You have already entered the sanctuary!', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // Leave Button (from Action Hub)
        if (interaction.customId.startsWith('mafia_leave_')) {
            await interaction.deferUpdate();
            const oldHostId = game.hostId;
            if (game.removePlayer(interaction.user.id)) {
                // If host migrated, load new host's preferences
                if (game.hostId !== oldHostId) {
                    MafiaManager.applyHostPreferences(game, game.hostId);
                    MafiaManager.saveState();
                }

                const { buildActionHub } = require('../mafia/MafiaUI');
                await interaction.editReply(buildActionHub(game, interaction.user));
                await game.refreshLobby(interaction.channel);
            } else {
                await interaction.followUp({ content: 'You are not in the lobby!', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // Play Again Button (from Victory Payload)
        if (interaction.customId.startsWith('mafia_play_again_')) {
            if (interaction.user.id !== game.hostId) {
                return interaction.reply({ content: '❌ **Access Denied.** Only the host can re-initialize the sanctuary.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferUpdate();
            await MafiaManager.playAgain(game, interaction.client);
            return;
        }

        // Host Conflict: Continue Existing
        if (interaction.customId.startsWith('mafia_host_conflict_continue_')) {
            return await interaction.update({ 
                content: '✅ **Archives Synchronized.** Your existing session remains active. Use `/mafia status` to locate it if needed.', 
                embeds: [], 
                components: [] 
            });
        }

        // Host Conflict: End Session
        if (interaction.customId.startsWith('mafia_host_conflict_end_')) {
            await MafiaManager.endGame(game.hostId);
            return await interaction.update({ 
                content: '🔴 **Record Terminated.** Your previous session has been redacted. You may now start a new one.', 
                embeds: [], 
                components: [] 
            });
        }

        // Host Conflict: New Session
        if (interaction.customId.startsWith('mafia_host_conflict_new_')) {
            await MafiaManager.endGame(game.hostId);
            return await interaction.update({ 
                content: '🚫 **Record Purged.** Archives are now clear. Please run `/mafia host` again to establish your new sanctuary.', 
                embeds: [], 
                components: [] 
            });
        }


        // Back to Lobby (settings back button)
        if (interaction.customId.startsWith('mafia_lobby_back_')) {
            const { buildActionHub } = require('../mafia/MafiaUI');
            return interaction.update(buildActionHub(game, interaction.user));
        }

        // Toggle role reveal setting
        if (interaction.customId.startsWith('mafia_togglereveal_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            game.settings.revealRoles = !game.settings.revealRoles;
            MafiaManager.hostPreferences.set(game.hostId, game.settings);
            MafiaManager.saveState();
            await interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game));
            await game.refreshLobby(interaction.channel);
            return;
        }

        // Toggle voice support setting
        if (interaction.customId.startsWith('mafia_togglevc_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            
            const current = game.settings.voiceSupport;
            if (current === 'new') game.settings.voiceSupport = 'existing';
            else if (current === 'existing') game.settings.voiceSupport = 'disabled';
            else game.settings.voiceSupport = 'new';

            await interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game));
            await game.refreshLobby(interaction.channel);
            return;
        }

        // Save preferences as default
        if (interaction.customId.startsWith('mafia_save_prefs_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can save preferences.', flags: MessageFlags.Ephemeral });
            
            await MafiaManager.saveHostPreferences(interaction.user.id, game.settings);
            return interaction.reply({ 
                content: '✅ **Identity Synced.** Your current sanctuary settings have been saved as your global default. They will be auto-applied to all future simulations you host.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Queue for next game
        if (interaction.customId.startsWith('mafia_queuenext_')) {
            const channelId = (interaction.channel.parentId || interaction.channel.id);
            if (!MafiaManager.globalQueues.has(channelId)) {
                MafiaManager.globalQueues.set(channelId, new Set());
            }
            const queue = MafiaManager.globalQueues.get(channelId);
            const isPlayer = game.players.has(interaction.user.id);
            
            if (queue.has(interaction.user.id)) {
                queue.delete(interaction.user.id);
                const { buildSpectatePayload } = require('../mafia/MafiaUI');
                await interaction.update(buildSpectatePayload(game));
                return interaction.followUp({ content: 'You have left the next-game queue.', flags: MessageFlags.Ephemeral });
            } else {
                queue.add(interaction.user.id);
                MafiaManager.saveState();
                const { buildSpectatePayload } = require('../mafia/MafiaUI');
                await interaction.update(buildSpectatePayload(game));
                
                let response = '✅ You have joined the waitlist for the next session!';
                if (isPlayer && game.state !== 'GAME_OVER') {
                    response += '\n\n⚠️ **Note:** As you are currently a participant, we will ask if you wish to remain in the lobby once this session concludes.';
                }
                
                return interaction.followUp({ content: response, flags: MessageFlags.Ephemeral });
            }
        }

        // Waitlist confirmation ("I'm here")
        if (interaction.customId.startsWith('mafia_here_')) {
            const hereParts = interaction.customId.split('_');
            const hereLobbyId = hereParts[2];
            const userId = hereParts[3];
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This beacon is not synchronized to your signature.', flags: MessageFlags.Ephemeral });
            }
            
            const targetGame = MafiaManager.getGameByLobby(hereLobbyId);
            if (!targetGame) return interaction.reply({ content: '❌ The sanctuary you are trying to enter has been lost.', flags: MessageFlags.Ephemeral });
            
            const p = targetGame.players.get(userId);
            if (p) {
                p.isConfirmed = true;
                await interaction.update({ content: `✅ **Synchronized:** <@${userId}> is here and ready.`, components: [] });
                
                try {
                    const lobbyMsg = await interaction.channel.messages.fetch(targetGame.lobbyMessageId);
                    const { buildLobbyPayload } = require('../mafia/MafiaUI');
                    await lobbyMsg.edit(buildLobbyPayload(targetGame));
                } catch(e) {}
            }
            return;
        }

        // Last Will button (from Night DM)
        if (interaction.customId.startsWith('mafia_will_')) {
            const parts = interaction.customId.split('_');
            
            // Validate phase/day if available (skip if parts too short meaning it's an old msg)
            if (parts.length >= 5) {
                const hostId = parts[2];
                const state = parts[3];
                const day = parseInt(parts[4]);
                
                if (state !== game.state || day !== game.dayCount) {
                    return interaction.reply({ content: '❌ **Terminal Desynchronized.** This link belongs to a previous phase. Please use the controls in your latest message.', flags: MessageFlags.Ephemeral });
                }
            }

            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'You must join the game first.', flags: MessageFlags.Ephemeral });
            if (!p.alive) return interaction.reply({ content: '❌ **Status: Redacted.** Your biometric records are locked. Dead players cannot update their records.', flags: MessageFlags.Ephemeral });
            
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
            const modal = new ModalBuilder().setCustomId(`mafia_setwill_${lobbyId}`).setTitle('Compose Last Will');
            const input = new TextInputBuilder()
                .setCustomId('last_will_input')
                .setLabel('Your Final Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('If I die, trust Bot 2... or tell my story to the stars.')
                .setValue(p.lastWill || '')
                .setMaxLength(1000);
            
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        // Voting buttons
        if (interaction.customId.startsWith('mafia_vote_')) {
            const voteParts = interaction.customId.split('_');
            
            // NEW FORMAT: mafia_vote_HOST_STATE_DAY_TARGET
            // OLD FORMAT: mafia_vote_HOST_TARGET
            let targetPlayerId;
            if (voteParts.length >= 6) {
                const state = voteParts[3];
                const day = parseInt(voteParts[4]);
                targetPlayerId = voteParts.slice(5).join('_');
                
                if (state !== game.state || day !== game.dayCount) {
                    return interaction.reply({ content: '❌ **Ballot Expired.** This voting board belongs to a previous phase. Please use the buttons in the most recent system update.', flags: MessageFlags.Ephemeral });
                }
            } else {
                targetPlayerId = voteParts.slice(3).join('_');
            }
            
            if (game.state !== 'VOTING') return interaction.reply({ content: 'Voting is currently closed.', flags: MessageFlags.Ephemeral });
            
            if (game.isLocked()) {
                return interaction.reply({ content: '⏳ **System Locking...** Consensus period is ending. No further ballots accepted.', flags: MessageFlags.Ephemeral });
            }

            const p = game.players.get(interaction.user.id);
            if (!p || !p.alive) return interaction.reply({ content: 'The dead cannot vote.', flags: MessageFlags.Ephemeral });
            
            if (p.inkBoundTarget === targetPlayerId) {
                return interaction.reply({ content: '❌ You are Ink-Bound and cannot vote for this suspect today.', flags: MessageFlags.Ephemeral });
            }
            
            p.voteTarget = targetPlayerId;
            let targetName = 'Skip Vote';
            let response = `✅ You cast your vote to **Skip Vote**.`;
            
            if (targetPlayerId !== 'skip') {
                targetName = game.players.get(targetPlayerId)?.name || 'Unknown';
                response = `✅ You cast your vote for **${targetName}**.`;
                
                if (p.role && p.role.vote_feedback) {
                    const randomIdx = Math.floor(Math.random() * p.role.vote_feedback.length);
                    response = `✅ ` + p.role.vote_feedback[randomIdx].replace('{target}', targetName);
                }
            }
            
            await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
            await game.updateVotingBoard();
        }

        // Spectate button
        if (interaction.customId.startsWith('mafia_spectate_')) {
            const result = await game.addSpectator(interaction.user);
            if (result.success) {
                // --- HOST NOTIFICATION ---
                try {
                    const host = await interaction.client.users.fetch(game.hostId);
                    if (host) {
                        await host.send(`👁️ **Spectator Alert:** <@${interaction.user.id}> has entered the archives of your session in **${interaction.guild.name}**.`);
                    }
                } catch(e) {}

                return await interaction.reply({ content: '👁️ You have entered the archives as a spectator. You have been granted visual access to the simulation hub.', flags: MessageFlags.Ephemeral });
            } else {
                return await interaction.reply({ content: `❌ **Access Denied:** ${result.message}`, flags: MessageFlags.Ephemeral });
            }
        }

        // --- STAGNATION WATCHDOG ---

        if (interaction.customId.startsWith('mafia_stagnation_keep_')) {
            game.lastActivityAt = Date.now();
            game.stagnationNoticeSent = false;
            game.stagnationExpiresAt = null;
            return interaction.update({ content: '✅ **Sanctuary Maintained.** Protocol will continue monitoring for activity.', embeds: [], components: [] });
        }

        if (interaction.customId.startsWith('mafia_stagnation_disband_')) {
            MafiaManager.endGame(game.hostId);
            return interaction.update({ content: '🗑️ **Sanctuary Disbanded.** This session has been removed from the records.', embeds: [], components: [] });
        }

        // --- NEW: PHASE 2 INTERACTIONS ---

        // View Roster Dashboard
        if (interaction.customId.startsWith('mafia_roster_view_')) {
            const { buildRosterPayload } = require('../mafia/MafiaUI');
            return await interaction.reply(buildRosterPayload(game));
        }

        // Refresh DM Panel (Now handled by phase transitions, but keep for legacy if still in older messages)
        if (interaction.customId.startsWith('mafia_dm_refresh_')) {
            return await interaction.reply({ 
                content: '🔄 **Terminal Synchronized.** Your control panel now automatically re-syncs at the start of every phase.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }

    // ═══════════════════════════════════════
    // MODAL SUBMITS
    // ═══════════════════════════════════════
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('mafia_setwill_')) {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'Player biometrics not found.', flags: MessageFlags.Ephemeral });
            if (!p.alive) return interaction.reply({ content: '❌ **Status: Redacted.** Dead players cannot update their records.', flags: MessageFlags.Ephemeral });
            p.lastWill = interaction.fields.getTextInputValue('last_will_input').slice(0, 1000);
            MafiaManager.saveState();
            return interaction.reply({ content: `✅ **Last Will Recorded.** It will be revealed upon your erasure.`, flags: MessageFlags.Ephemeral });
        }
        return;
    }

    // ═══════════════════════════════════════
    // SELECT MENUS
    // ═══════════════════════════════════════
    if (interaction.isStringSelectMenu()) {

        // Game Mode selector (settings)
        if (interaction.customId.startsWith('mafia_setmode_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            game.settings.gameMode = interaction.values[0];
            MafiaManager.hostPreferences.set(game.hostId, game.settings);
            MafiaManager.saveState();
            await interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game));
            await game.refreshLobby(interaction.channel);
            return;
        }

        // Phase Category selector (settings step 1)
        if (interaction.customId.startsWith('mafia_setphase_cat_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            const cat = interaction.values[0];
            return interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game, cat));
        }

        // Phase Duration selector (settings step 2)
        if (interaction.customId.startsWith('mafia_setphase_val_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            
            const valParts = interaction.customId.split('_');
            const cat = valParts[4];
            const val = parseInt(interaction.values[0]);

            if (cat === 'discussion') game.settings.discussionTime = val;
            else if (cat === 'voting') game.settings.votingTime = val;
            else if (cat === 'night') game.settings.nightTime = val;
            else if (cat === 'prologue') game.settings.prologueTime = val;

            MafiaManager.hostPreferences.set(game.hostId, game.settings);
            MafiaManager.saveState();
            await interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game, cat));
            await game.refreshLobby(interaction.channel);
            return;
        }
        
        // Night ability target selector (DM - Terminal Revamp)
        if (interaction.customId.startsWith('mafia_night_target_') || interaction.customId.startsWith('mafia_action_')) {
            const parts = interaction.customId.split('_');
            if (parts.length >= 5) {
                const state = parts[3];
                const day = parseInt(parts[4]);
                if (state !== game.state || day !== game.dayCount) {
                    return interaction.update({ content: '>>> 🔄 **Terminal Error:** This console has been desynchronized by a phase transition. Please use the most recent uplink.', components: [] });
                }
            }

            if (game.state !== 'NIGHT') return interaction.update({ content: '>>> 🔄 **Terminal Error:** Night protocols have concluded.', components: [] });
            
            if (game.isLocked()) {
                return interaction.reply({ content: '⏳ **Static Interference...** Morning is approaching. Night protocols are now locked.', flags: MessageFlags.Ephemeral });
            }

            const p = game.players.get(interaction.user.id);
            const targetId = interaction.values[0];
            
            if (p && p.alive) {
                p.nightActionTarget = targetId;
                const targetName = game.players.get(targetId)?.name || (targetId === 'ignite' ? 'All Doused' : 'Unknown');
                let response = `Target locked: **${targetName}**.`;
                
                if (p.role && p.role.feedback) {
                    const randomIdx = Math.floor(Math.random() * p.role.feedback.length);
                    response = p.role.feedback[randomIdx].replace('{target}', targetName);
                } else if (p.role && p.role.name === 'The Bookburner') {
                    if (targetId === 'ignite') {
                        const randomIdx = Math.floor(Math.random() * (p.role.feedback_ignite?.length || 1));
                        response = p.role.feedback_ignite ? p.role.feedback_ignite[randomIdx] : 'Ignition sequence initiated.';
                    } else {
                        const randomIdx = Math.floor(Math.random() * (p.role.feedback_douse?.length || 1));
                        response = p.role.feedback_douse ? p.role.feedback_douse[randomIdx].replace('{target}', targetName) : `Target doused: **${targetName}**.`;
                    }
                }

                // 1. Acknowledge with Ephemeral (Per User Request)
                await interaction.reply({ content: `✅ **Protocol Recorded:** ${response}`, flags: MessageFlags.Ephemeral });

                // 2. Refresh HUD (This will remove the dropdown because player.nightActionTarget is now set)
                const { buildNightHUD } = require('../mafia/MafiaUI');
                const hud = buildNightHUD(p, game);
                await game.refreshControlPanel(p, hud.content, hud.components);
                
                // 3. UX: Check for phase skipping if everyone has acted
                await game.checkNightSkip();
            } else {
                await interaction.reply({ content: '❌ **Biometric Failure:** You cannot act in your current state.', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // ─── Lobby Terminal Actions ───
        const action = interaction.values[0];
        const { buildActionHub } = require('../mafia/MafiaUI');
        
        if (action === 'join') {
            await interaction.deferUpdate();
            if (game.addPlayer(interaction.user)) {
                await interaction.editReply(buildActionHub(game, interaction.user));
                await game.refreshLobby(interaction.channel);
            }
        }
        else if (action === 'leave') {
            await interaction.deferUpdate();
            if (game.removePlayer(interaction.user.id)) {
                await interaction.editReply(buildActionHub(game, interaction.user));
                await game.refreshLobby(interaction.channel);
            }
        }
        else if (action === 'personal_stats') {
            await interaction.deferReply({ flags: 64 });
            const mafiaService = require('../services/mafiaService');
            const stats = await mafiaService.getPlayerStats(interaction.user.id);
            const { buildMafiaProfile } = require('../mafia/MafiaUI');
            const profile = buildMafiaProfile(interaction.user, stats);
            await interaction.editReply(profile);
        }
        else if (action === 'status') {
            const alive = game.getAlivePlayers();
            const dead = Array.from(game.players.values()).filter(p => !p.alive);
            const statusStr = `📊 **Roster Status**\nAlive: ${alive.length} | Redacted: ${dead.length}\n\n**Survivors:**\n${alive.map(p => `• ${p.name}`).join('\n')}`;
            await interaction.update({ content: statusStr, components: [] });
        }
        else if (action === 'start') {
            if (interaction.user.id !== game.hostId) {
                return interaction.reply({ content: 'Only the host can start the game.', flags: MessageFlags.Ephemeral });
            }
            if (game.players.size < 4) {
                return interaction.reply({ content: 'Not enough survivors! A minimum of 4 is required.', flags: MessageFlags.Ephemeral });
            }
            
            await interaction.deferUpdate();
            const { buildSpectatePayload } = require('../mafia/MafiaUI');
            const payload = buildSpectatePayload(game);
            await interaction.editReply(payload);
            await game.start(interaction);
        }
        else if (action === 'inject_bots') {
            if (!interaction.member.permissions.has('ManageGuild')) {
                return interaction.reply({ content: 'You need Manage Server permissions to inject bots.', flags: MessageFlags.Ephemeral });
            }
            
            const thematicNames = ['Synth-Scribe', 'Drone Protocol', 'Automated Guard', 'Library Construct', 'Data Phantom', 'Security Node', 'Index Crawler', 'Archive Proxy'];
            const current = game.players.size;
            const needed = Math.max(1, 4 - current); 
            for (let i = 0; i < needed; i++) {
                const botNumber = game.players.size + 1;
                const randomName = thematicNames[Math.floor(Math.random() * thematicNames.length)] + ` [${botNumber}]`;
                const botId = `mock-bot-${Date.now()}-${i}`; // Switched to hyphens to avoid split conflicts
                game.addPlayer({ id: botId, username: randomName, displayName: randomName }, true);
            }
            
            await interaction.update(buildActionHub(game, interaction.user));
            await game.refreshLobby(interaction.channel);
        }
        else if (action === 'disband') {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can disband the sanctuary.', flags: MessageFlags.Ephemeral });
            
            MafiaManager.endGame(game.hostId);
            
            return interaction.update({ content: '✅ **Sanctuary Disbanded.** This session has been removed from the records.', embeds: [], components: [] });
        }
        else if (action === 'settings') {
            if (interaction.user.id !== game.hostId) {
                return await interaction.reply({ content: 'Only the host can change settings.', flags: MessageFlags.Ephemeral });
            }
            return await interaction.reply(require('../mafia/MafiaUI').buildSettingsPayload(game));
        }
        else if (action === 'last_will') {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'You must join the game first.', flags: MessageFlags.Ephemeral });
            if (!p.alive) return interaction.reply({ content: '❌ **Status: Redacted.** Dead players cannot update their records.', flags: MessageFlags.Ephemeral });
            
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
            const modal = new ModalBuilder().setCustomId(`mafia_setwill_${lobbyId}`).setTitle('Compose Last Will');
            const input = new TextInputBuilder()
                .setCustomId('last_will_input')
                .setLabel('Your Final Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('If I die, trust Bot 2... or tell my story to the stars.')
                .setValue(p.lastWill || '')
                .setMaxLength(1000);
            
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
    }
};

module.exports = { 
    handleMafiaInteraction,
    routerConfig: {
        prefixes: ['mafia_', 'archive_'],
        handle: handleMafiaInteraction
    }
};
