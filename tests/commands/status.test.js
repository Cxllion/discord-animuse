const statusCommand = require('../../commands/general/status');
const MockInteraction = require('../helpers/MockInteraction');

describe('Status Command', () => {
    let interaction;

    beforeEach(() => {
        interaction = new MockInteraction({
            commandName: 'status'
        });
    });

    test('should execute and send a diagnostic embed', async () => {
        await statusCommand.execute(interaction);

        expect(interaction.deferred).toBe(true);
        expect(interaction.replies.length).toBe(1);
        
        const embed = interaction.replies[0].embeds[0];
        expect(embed.data.title).toBe('📖 System Diagnostic Complete');
        expect(embed.data.fields).toContainEqual(
            expect.objectContaining({ name: 'Connection' })
        );
    });
});
