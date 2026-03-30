const { EmbedBuilder } = require('discord.js');
const baseEmbed = require('../generators/baseEmbed');
const { EMOJIS } = require('../config/emojiConfig');

/**
 * LoadingManager handles beautiful, animated loading states for Discord interactions.
 * Optimized to minimize API overhead while maintaining a premium feel.
 */
class LoadingManager {
    constructor(interaction) {
        this.interaction = interaction;
        this.timer = null;
        this.currentFrame = 0;
        this.progress = 0; // 0 to 100
        this.message = 'Processing...';
        this.type = 'CYCLE'; // 'CYCLE', 'STEP', or 'PROGRESS'
        
        // Premium cyclic frames
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        
        this.steps = [
            'Consulting the archives...',
            'Unrolling the parchment...',
            'Gathering ink and quill...',
            'Materializing the record...',
            'Finalizing the binding...'
        ];

        // Engine State
        this.isStopping = false;
        this.isRendering = false; // Prevents overlapping API calls
        this.lastContent = '';
        this.lastRenderTime = 0;
        this.renderInterval = 1500; // Minimum ms between edits to avoid rate limits
    }

    /**
     * Starts a cyclic animation (spinner)
     */
    async start(message = 'Processing Request') {
        this.message = message;
        this.type = 'CYCLE';
        this.currentFrame = 0;
        
        await this._render(true); // Force initial render

        this.timer = setInterval(() => {
            if (this.isStopping) return;
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this._render().catch(() => this.stop());
        }, 1200);
    }

    /**
     * Starts a stepped progress animation
     */
    async startSteps(customSteps = null, interval = 2500) {
        if (customSteps) this.steps = customSteps;
        this.type = 'STEP';
        this.currentFrame = 0;

        await this._render(true);

        this.timer = setInterval(() => {
            if (this.isStopping) return;
            this.currentFrame++;
            if (this.currentFrame >= this.steps.length) {
                this.currentFrame = this.steps.length - 1;
                clearInterval(this.timer);
                return;
            }
            this._render().catch(() => this.stop());
        }, interval);
    }

    /**
     * Starts a smooth progress bar animation.
     * Increments progress internally and renders periodically.
     */
    async startProgress(message = 'Materializing...', totalSeconds = 5) {
        this.type = 'PROGRESS';
        this.message = message;
        this.progress = 0;
        this.currentFrame = 0;
        
        await this._render(true);

        const increment = 100 / (totalSeconds * 10); // 10 ticks per second
        this.timer = setInterval(() => {
            if (this.isStopping) return;
            
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.progress = Math.min(this.progress + increment, 99); // Stay at 99 until stop()
            
            this._render().catch(() => this.stop());
        }, 100);
    }

    /**
     * Internal rendering logic with throttling and locking
     */
    async _render(force = false) {
        if (!this.interaction || this.isStopping || this.isRendering) return;

        const now = Date.now();
        if (!force && (now - this.lastRenderTime < this.renderInterval)) return;

        const content = this._getContent();
        if (!force && content === this.lastContent) return;

        this.isRendering = true;
        this.lastContent = content;
        this.lastRenderTime = now;

        try {
            if (this.interaction.replied || this.interaction.deferred) {
                await this.interaction.editReply({ content }).catch(() => null);
            } else {
                await this.interaction.reply({ content }).catch(() => null);
            }
        } catch (e) {
            this.isStopping = true;
            this._cleanup();
        } finally {
            this.isRendering = false;
        }
    }

    /**
     * Generates the text content for the current state
     */
    _getContent() {
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
            const filled = Math.round((this.progress / 100) * size);
            const bar = '▰'.repeat(filled) + '▱'.repeat(size - filled);
            
            const displayPercent = Math.floor(this.progress);
            
            const funMessages = [
                "Polishing the pixels...", "Waking up the library cat...", "Consulting the high elders...",
                "Searching the restricted section...", "Translating magic into image...", "Sharpening the virtual ink...",
                "Basking in the archival glow...", "Decoding the anime fragments...", "Calibrating thematic vibes..."
            ];
            // Slow down fun message rotation to once every 3s to minimize content churn
            const funMsg = funMessages[Math.floor(Date.now() / 3000) % funMessages.length];

            return `${spinner} **${this.message}**\n\`${bar}\` **${displayPercent}%**\n> *${funMsg}*`;
        }

        return `${spinner} Processing...`;
    }

    _cleanup() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Stops the animation and delivers the final payload.
     */
    async stop(finalPayload = null) {
        if (this.isStopping && !finalPayload) return;
        
        this.isStopping = true;
        this._cleanup();
        this.progress = 100;

        try {
            const options = finalPayload ? { content: '', ...finalPayload } : { content: this._getContent() };
            
            if (this.interaction.replied || this.interaction.deferred) {
                return await this.interaction.editReply(options).catch(() => null);
            } else {
                return await this.interaction.reply(options).catch(() => null);
            }
        } catch (e) {
            return null;
        }
    }

    static async pulse(interaction, message) {
        const loader = new LoadingManager(interaction);
        await loader.start(message);
        return loader;
    }
}

module.exports = LoadingManager;

