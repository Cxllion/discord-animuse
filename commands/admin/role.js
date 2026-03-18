const { SlashCommandBuilder, PermissionFlagsBits , MessageFlags } = require('discord.js');
const { getRoleCategories, createRoleCategory, registerServerRole, unregisterServerRole } = require('../../utils/core/database');
const { displayRoleDashboard } = require('../../utils/handlers/roleDashboard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Advanced server role management tool.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

        // add
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a role to a user.')
            .addUserOption(option => option.setName('user').setDescription('The user').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('The role').setRequired(true))
        )
        // remove
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a role from a user.')
            .addUserOption(option => option.setName('user').setDescription('The user').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('The role').setRequired(true))
        )
        // create
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('Create a new role and optionally assign it to a category.')
            .addStringOption(option => option.setName('name').setDescription('Name for the new role').setRequired(true))
            .addStringOption(option => option.setName('category').setDescription('The category to assign this role to').setRequired(false))
            .addStringOption(option => option.setName('color').setDescription('Hex color code (e.g. #FF0000)').setRequired(false))
            .addBooleanOption(option => option.setName('hoist').setDescription('Display role separately').setRequired(false))
        )
        // register
        .addSubcommand(sub => sub
            .setName('register')
            .setDescription('Register an existing role to a category.')
            .addRoleOption(option => option.setName('role').setDescription('The role to register').setRequired(true))
            .addStringOption(option => option.setName('category_name').setDescription('Name of the category to place it in').setRequired(true))
        )
        // delete
        .addSubcommand(sub => sub
            .setName('delete')
            .setDescription('Delete a role from the server entirely.')
            .addRoleOption(option => option.setName('role').setDescription('The role to delete').setRequired(true))
        ),
    dbRequired: true,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const executor = interaction.member;



        // Handle Add
        if (sub === 'add') {
            const targetUser = interaction.options.getMember('user');
            const targetRole = interaction.options.getRole('role');
            if (targetRole.position >= executor.roles.highest.position && interaction.user.id !== guild.ownerId) {
                return interaction.reply({ content: 'You cannot manage a role higher or equal to your own.', flags: MessageFlags.Ephemeral });
            }
            if (!targetUser) return interaction.reply({ content: 'User not found in this server.', flags: MessageFlags.Ephemeral });
            
            try {
                await targetUser.roles.add(targetRole);
                return interaction.reply({ content: `✅ Added ${targetRole} to ${targetUser}.` });
            } catch(e) {
                return interaction.reply({ content: `❌ Failed to add role: ${e.message}`, flags: MessageFlags.Ephemeral });
            }
        }

        // Handle Remove
        if (sub === 'remove') {
            const targetUser = interaction.options.getMember('user');
            const targetRole = interaction.options.getRole('role');
            if (targetRole.position >= executor.roles.highest.position && interaction.user.id !== guild.ownerId) {
                return interaction.reply({ content: 'You cannot manage a role higher or equal to your own.', flags: MessageFlags.Ephemeral });
            }
            if (!targetUser) return interaction.reply({ content: 'User not found in this server.', flags: MessageFlags.Ephemeral });
            
            try {
                await targetUser.roles.remove(targetRole);
                return interaction.reply({ content: `✅ Removed ${targetRole} from ${targetUser}.` });
            } catch(e) {
                return interaction.reply({ content: `❌ Failed to remove role: ${e.message}`, flags: MessageFlags.Ephemeral });
            }
        }

        // Handle Create
        if (sub === 'create') {
            const name = interaction.options.getString('name');
            const catName = interaction.options.getString('category');
            const color = interaction.options.getString('color') || '#99aab5';
            const hoist = interaction.options.getBoolean('hoist') || false;

            await interaction.deferReply();
            try {
                const newRole = await guild.roles.create({
                    name: name,
                    color: color,
                    hoist: hoist,
                    reason: `Role created by ${interaction.user.tag}`
                });

                let catMsg = '';
                if (catName) {
                    const categories = await getRoleCategories(guild.id);
                    let targetCat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                    if (!targetCat) targetCat = await createRoleCategory(guild.id, catName);
                    
                    if (targetCat) {
                        await registerServerRole(guild.id, newRole.id, targetCat.id);
                        catMsg = ` and registered under **${targetCat.name}**`;
                    }
                }

                return interaction.editReply({ content: `✅ Created role ${newRole}${catMsg} successfully.\n*Roles in categories are immune to the purge utility.*`});
            } catch(e) {
                return interaction.editReply({ content: `❌ Failed to create role: ${e.message}` });
            }
        }

        // Handle Register
        if (sub === 'register') {
            const role = interaction.options.getRole('role');
            const catName = interaction.options.getString('category_name');
            await interaction.deferReply();

            // Find or create category
            let categories = await getRoleCategories(guild.id);
            let targetCat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
            
            if (!targetCat) {
                targetCat = await createRoleCategory(guild.id, catName);
                if(!targetCat) return interaction.editReply({ content: '❌ Failed to create category in database.'});
            }

            await registerServerRole(guild.id, role.id, targetCat.id);
            return interaction.editReply({ content: `✅ Successfully registered ${role} under the category **${targetCat.name}**.`});
        }

        // Handle Delete
        if (sub === 'delete') {
            const role = interaction.options.getRole('role');
            if (role.position >= executor.roles.highest.position && interaction.user.id !== guild.ownerId) {
                return interaction.reply({ content: 'You cannot delete a role higher or equal to your own.', flags: MessageFlags.Ephemeral });
            }
            
            await interaction.deferReply();
            try {
                const roleName = role.name;
                await unregisterServerRole(role.id); // clear from db
                await role.delete(`Deleted by ${interaction.user.tag}`);
                return interaction.editReply({ content: `✅ Role **${roleName}** has been completely erased from the server.` });
            } catch(e) {
                return interaction.editReply({ content: `❌ Failed to delete role: ${e.message}` });
            }
        }
    }
};
