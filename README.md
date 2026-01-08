# 🎭 AniMuse - Discord Bot

A feature-rich, production-ready Discord bot for anime communities. Track anime releases, manage bingo cards, create beautiful profiles, and engage your community with anime-themed features.

## ✨ Features

### 🎬 Anime Tracking & Notifications
- **Live Episode Notifications**: Get notified when your favorite anime airs
- **AniList Integration**: Search anime, link your AniList profile
- **Smart Scheduling**: Efficient polling system that respects API limits

### 🎮 Interactive Features
- **Bingo Cards**: Create customizable anime/manga bingo cards with AniList sync
- **User Profiles**: Beautiful custom profile cards with XP, levels, and titles
- **Leaderboards**: Server-wide XP rankings

### 🛡️ Moderation & Management
- **Comprehensive Mod Tools**: Warn, mute, kick, ban with logging
- **Self-Roles System**: Let users choose their own roles
- **Welcome Messages**: Custom welcome cards for new members

### 🎨 Customization
- **Profile Theming**: Custom colors, backgrounds, avatars
- **Title System**: Unlock and display custom titles
- **Favorites**: Showcase your favorite anime/manga

## 🚀 Quick Start

### Prerequisites
- Node.js 16.9.0 or higher
- Discord Bot Token ([Get one here](https://discord.com/developers/applications))
- Supabase Account ([Sign up free](https://supabase.com))
- (Optional) AniList Client ID ([Developer Portal](https://anilist.co/settings/developer))

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd discord_animuse
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and fill in your credentials:
   - `DISCORD_TOKEN`: Your bot token
   - `CLIENT_ID`: Your Discord application ID
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_KEY`: Your Supabase service role key (anon key won't work for RLS)
   - `DATABASE_URL`: PostgreSQL connection string from Supabase
   - `ANILIST_CLIENT_ID`: (Optional) For anime search features
   - `DEPLOY_ON_START`: Set to `true` for development

4. **Start the bot**
   ```bash
   npm start
   ```

5. **Verify it's running**
   - Check console for: `Ready! Logged in as YourBotName`
   - Invite bot to your server using the URL from Discord Developer Portal
   - Try `/ping` command

## 🌐 Deployment to Render

### Step 1: Prepare Your Repository

1. Make sure your code is pushed to GitHub
2. Ensure `.gitignore` is properly configured (already included)

### Step 2: Create Render Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `animuse-bot` (or your preferred name)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Instance Type**: Free (or paid for better reliability)

### Step 3: Set Environment Variables

In Render dashboard, add these environment variables:

```
DISCORD_TOKEN=<your_bot_token>
CLIENT_ID=<your_application_id>
SUPABASE_URL=<your_supabase_url>
SUPABASE_KEY=<your_service_role_key>
DATABASE_URL=<your_postgres_connection_string>
ANILIST_CLIENT_ID=<your_anilist_client_id>
DEPLOY_ON_START=false
NODE_ENV=production
```

> **Important**: Set `DEPLOY_ON_START=false` in production to avoid Discord API rate limits on restarts

### Step 4: Deploy

1. Click **Create Web Service**
2. Wait for initial build and deployment
3. Check logs for successful startup
4. Bot should now be online 24/7!

## 📊 Database Setup

AniMuse uses **automatic database migrations**. On first startup, it will:
- Create all required tables
- Set up indexes for performance
- Configure Row Level Security policies

No manual SQL execution needed! Just ensure your `DATABASE_URL` is correct.

### Required Tables (auto-created)
- `guild_configs` - Server settings
- `users` - User XP, levels, profiles
- `bingo_cards` - Bingo game data
- `subscriptions` - Anime tracking
- `tracked_anime_state` - Airing schedule cache
- `moderation_logs` - Mod action history
- And more...

## 🎮 Available Commands

### General
- `/ping` - Check bot responsiveness
- `/serverinfo` - Display server information
- `/userinfo [user]` - Show user details

### Social & Profiles
- `/profile [user]` - View user profile card
- `/leaderboard` - Server XP rankings
- `/link <username>` - Link AniList account
- `/unlink` - Unlink AniList account

### Anime & Manga
- `/search <query>` - Search anime/manga on AniList
- `/track <anime>` - Get notifications for new episodes

### Bingo System
- `/bingo create` - Create a new bingo card (guided wizard)
- `/bingo view [user] [card]` - View bingo cards
- `/bingo add <anime> [card]` - Add anime to card
- `/bingo fetch [card]` - Auto-fill from AniList Planning list
- `/bingo edit <card>` - Manage your bingo cards

### Moderation
- `/warn <user> [reason]` - Warn a user
- `/mute <user> [reason]` - Mute a user
- `/kick <user> [reason]` - Kick a user
- `/ban <user> [reason]` - Ban a user
- `/purge <amount>` - Delete messages
- `/case <user>` - View moderation history

### Configuration
- `/channel assign <type> <channel>` - Set bot channels
- `/feature toggle <feature>` - Enable/disable features

### Admin
- `/parent` - Set up self-roles system (advanced)

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Bot token from Discord Developer Portal |
| `CLIENT_ID` | ✅ | Discord application ID |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_KEY` | ✅ | Supabase service role key |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ANILIST_CLIENT_ID` | ❌ | For anime search (highly recommended) |
| `DEPLOY_ON_START` | ❌ | Auto-deploy commands (default: true) |

### Production Best Practices

1. **Set `DEPLOY_ON_START=false`** in production
   - Prevents rate limits on frequent restarts
   - Only enable in development for convenience

2. **Use Supabase Service Role Key**
   - Don't use the anon/public key
   - Required for RLS policies to work

3. **Monitor Logs**
   - Check for database connection issues
   - Watch for API rate limit warnings

## 🐛 Troubleshooting

### Bot won't start
- **Error**: `Missing required environment variables`
  - Solution: Check your `.env` file has all required variables

### Database connection failed
- **Error**: `Could not connect to the archives`
  - Solution: Verify `DATABASE_URL` is correct
  - Check Supabase project is not paused
  - Ensure your IP is allowed (Render IPs are whitelisted by default)

### Commands not showing up
- **Issue**: Slash commands not appearing in Discord
  - Solution: Set `DEPLOY_ON_START=true` and restart
  - Wait up to 1 hour for global command sync
  - Or kick and re-invite the bot

### AniList features not working
- **Issue**: Search returns no results
  - Solution: Add `ANILIST_CLIENT_ID` to environment variables
  - Create an AniList app at https://anilist.co/settings/developer

## 📝 Development

### Project Structure
```
discord_animuse/
├── commands/          # Slash commands by category
├── events/            # Discord.js event handlers
├── utils/
│   ├── core/         # Database, logger, init
│   ├── services/     # AniList, bingo, leveling, scheduler
│   ├── handlers/     # Interaction routing, error handling
│   └── generators/   # Canvas image generation
├── assets/           # Images, fonts
├── index.js          # Entry point
└── package.json
```

### Adding New Commands
1. Create file in appropriate `commands/` subdirectory
2. Export module with `data` (SlashCommandBuilder) and `execute` function
3. Restart bot (auto-loaded on startup)

### Testing
- Use a separate test server
- Set `DEPLOY_ON_START=true` for rapid iteration
- Check logs for any errors

## 📜 License

This project is licensed under the MIT License - see LICENSE file for details.

## 🙏 Credits

- Built with [discord.js](https://discord.js.org/)
- Database powered by [Supabase](https://supabase.com/)
- Anime data from [AniList API](https://anilist.co/)
- Canvas rendering with [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas)

## 💬 Support

Need help? Found a bug?
- Check the [Troubleshooting](#-troubleshooting) section
- Review logs for error messages
- Ensure all environment variables are set correctly

---

**Made with ❤️ for anime communities**
