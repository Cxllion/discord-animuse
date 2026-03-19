const { EmbedBuilder } = require('discord.js');
const baseEmbed = require('../generators/baseEmbed');
const { EMOJIS } = require('../config/emojiConfig');

/**
 * LoadingManager handles beautiful, animated loading states for Discord interactions.
 * It provides a "Material You" flavored experience with a library-themed twist.
 */
class LoadingManager {
    constructor(interaction) {
        this.interaction = interaction;
        this.timer = null;
        this.currentFrame = 0;
        this.message = 'Processing...';
        this.type = 'CYCLE'; // 'CYCLE', 'STEP', or 'PROGRESS'
        
        // Premium cyclic frames (Library/Mystic themed)
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        
        this.steps = [
            'Consulting the archives...',
            'Unrolling the parchment...',
            'Gathering ink and quill...',
            'Materializing the record...',
            'Finalizing the binding...'
        ];

        // Engine State
        this.startTime = 0;
        this.targetSeconds = 5;
        this.isStopping = false;
        this.lastRender = 0;
        this.renderCount = 0;
        this.lastRounded = -1;
        this.rendering = false;
    }

    /**
     * Starts a cyclic animation (spinner)
     * @param {string} message The message to display alongside the spinner
     */
    async start(message = 'ProcessingRequest') {
        this.message = message;
        this.type = 'CYCLE';
        this.currentFrame = 0;
        
        // Initial feedback
        await this._render();

        // Start animation loop (Slower 1200ms to avoid network stutter)
        this.timer = setInterval(() => {
            if (this.isStopping) return;
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this._render().catch(() => this.stop());
        }, 1200);
    }

    /**
     * Starts a stepped progress animation
     * @param {string[]} customSteps Array of strings for each step
     * @param {number} interval Time between steps in ms
     */
    async startSteps(customSteps = null, interval = 2500) {
        if (customSteps) this.steps = customSteps;
        this.type = 'STEP';
        this.currentFrame = 0;

        await this._render();

        this.timer = setInterval(() => {
            this.currentFrame++;
            if (this.currentFrame >= this.steps.length) {
                // If we run out of steps, just keep the last one or switch to pulse
                this.currentFrame = this.steps.length - 1;
                clearInterval(this.timer);
                return;
            }
            this._render().catch(() => this.stop());
        }, interval);
    }

    /**
     * Starts a stepped animation using themed messages from config
     * @param {string} theme The theme key (e.g. 'GENERIC', 'BINGO')
     * @param {number} count Number of unique steps to pick
     * @param {number} interval Time between steps
     */
    async startThemedSteps(theme = 'GENERIC', count = 4, interval = 1200) {
        const { loadingMessages } = require('../config/loadingMessages');
        const pool = loadingMessages[theme] || loadingMessages['GENERIC'];
        
        // Pick random unique steps from the pool
        const selected = [];
        const shuf = [...pool].sort(() => 0.5 - Math.random());
        for (let i = 0; i < Math.min(count, shuf.length); i++) {
            selected.push(shuf[i]);
        }
        
        return this.startSteps(selected, interval);
    }

    /**
     * Starts an ultra-stable progress bar.
     * Uses a multi-stage approach to minimize API overhead while showing progress.
     */
    async startProgress(message = 'Materializing...', totalSeconds = 5) {
        this.type = 'PROGRESS';
        this.message = message;
        this.currentFrame = 0;
        this.isStopping = false;
        
        // Stage 1: Initial Render
        await this._render().catch(() => null);

        // Stage 2: Middle Progress (Simplified to 2 key milestones to save resources)
        const midway = (totalSeconds * 1000) / 2;
        
        this.timer = setTimeout(async () => {
            if (this.isStopping) return;
            this.currentFrame = 50;
            await this._render().catch(() => null);
        }, midway);
    }

    /**
     * Internal rendering logic
     */
    async _render() {
        if (!this.interaction || this.isStopping) return;
        const content = this._getContent();
        
        // Optimization: Only update if content changed or it's a new interaction
        if (content === this.lastContent) return;
        this.lastContent = content;

        try {
            if (this.interaction.replied || this.interaction.deferred) {
                await this.interaction.editReply({ content }).catch(() => null);
            } else {
                await this.interaction.reply({ content }).catch(() => null);
            }
        } catch (e) {
            this.isStopping = true;
            this._cleanup();
        }
    }

    /**
     * Generates the text content for the current state
     */
    _getContent() {
        if (!this.type) return 'Processing...';

        const spinner = this.frames[this.currentFrame % this.frames.length];

        if (this.type === 'CYCLE') {
            return `${spinner} **${this.message}**`;
        } 
        
        if (this.type === 'STEP') {
            const stepText = this.steps[this.currentFrame] || this.steps[this.steps.length - 1];
            const hasEmoji = /\p{Emoji}/u.test(stepText);
            const icon = hasEmoji ? '' : [EMOJIS.BOOKS, EMOJIS.BOOK_OPEN, EMOJIS.SEARCH, EMOJIS.MAGIC, EMOJIS.PARCHMENT][this.currentFrame % 5] + ' ';
            return `${spinner} ${icon}**${stepText}**`;
        }

        if (this.type === 'PROGRESS') {
            const size = 12;
            const filled = Math.min(Math.max(Math.round((this.currentFrame / 100) * size), 0), size);
            const bar = '▰'.repeat(filled) + '▱'.repeat(size - filled);
            
            const displayPercent = this.currentFrame >= 100 ? 100 : Math.floor(this.currentFrame / 10) * 10;
            
            const funMessages = [
                "Polishing the pixels...", "Waking up the library cat...", "Consulting the high elders...",
                "Searching the restricted section...", "Translating magic into image...", "Sharpening the virtual ink...",
                "Basking in the archival glow...", "Decoding the anime fragments...", "Calibrating thematic vibes..."
            ];
            const funMsg = displayPercent >= 100 ? "Ready! Opening the archives..." : funMessages[Math.floor(Date.now() / 2500) % funMessages.length];

            return `${spinner} **${this.message}**\n\`${bar}\` **${displayPercent}%**\n> *${funMsg}*`;
        }

        return 'Processing...';
    }

    _cleanup() {
        if (this.timer) {
            clearTimeout(this.timer);
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Stops the animation and ensures it hits 100% (if Progress).
     * Delivers final graphic immediately with 100% state for perfect timing.
     */
    async stop(finalPayload = null) {
        if (this.isStopping && !finalPayload) return;
        
        this.isStopping = true;
        this._cleanup();
        
        if (this.type === 'PROGRESS') {
            this.currentFrame = 100;
        }

        try {
            if (finalPayload) {
                // Combine final payload with 100% state
                // We clear the content text in the SAME call if finalPayload is an embed
                const result = await this.interaction.editReply({ 
                    content: '', // Clear the loading text immediately to let the embed shine
                    ...finalPayload 
                });

                return result;
            } else {
                return await this._render();
            }
        } catch (e) {
            return null;
        }
    }

    /**
     * Static helper for a quick "Finding result..." pulse
     */
    static async pulse(interaction, message) {
        const loader = new LoadingManager(interaction);
        await loader.start(message);
        return loader;
    }
}

module.exports = LoadingManager;
