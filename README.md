# discord-stream-bot

# discord-stream-bot 🎥🎵

A powerful Discord bot for live streaming in voice channels. Supports multiple channels, categories, and simultaneous streams with smart retry and dashboard management.

---

## 🚀 Introduction

**discord-stream-bot** brings live audio streaming right into your Discord server’s voice channels! Effortlessly manage multiple live streams, group them by category, and control everything from an intuitive dashboard. Whether you’re streaming news, music, or events, this bot has you covered with advanced reliability and flexible channel support.

---

## ✨ Features

- **Multiple Channels & Categories**: Organize streams into categories and broadcast in several voice channels at once.
- **Simultaneous Streams**: Run several streams concurrently without interruptions.
- **Smart Retry Mechanism**: Automatically retries backup streams if the primary source fails.
- **Interactive Dashboard**: Manage streams, monitor status, and view logs with an easy-to-use dashboard.
- **Configurable Bitrate**: Customize audio quality per channel.
- **Robust Logging**: Detailed logging for monitoring and debugging.
- **Production-Ready**: PM2 configuration and memory management included.

---

## 📦 Installation

### 1. Requirements

- [Node.js](https://nodejs.org/) (v16+ recommended)
- [npm](https://www.npmjs.com/)
- A Discord Bot Token ([guide](https://discord.com/developers/applications))
- (Optional) [PM2](https://pm2.keymetrics.io/) for process management

### 2. Clone & Install

```bash
git clone https://github.com/yourusername/discord-stream-bot.git
cd discord-stream-bot
npm install
```

### 3. Configuration

- **Discord Bot Token**: Set your bot token in an environment variable or your config.
- **Channels & Streams**: Edit `channels/all_channels.json` to configure your stream sources and categories.

### 4. Run the Bot

```bash
npm start
```

Or start with PM2 (recommended for production):

```bash
pm2 start ecosystem.config.js
```

---

## 📖 Usage

1. **Invite the Bot**  
   Invite your bot to your server using your bot application's OAuth2 URL.

2. **Start Streaming**  
   Use slash commands to start, stop, or switch streams in voice channels.

3. **Dashboard**  
   Launch the dashboard:

   ```bash
   npm run start:dashboard
   ```
   Then open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Customization**  
   - Edit `channels/all_channels.json` for adding/removing streams.
   - Adjust logging and player settings in `lib/logger.js` and `lib/playerManager.js`.

---

## 🤝 Contributing

We welcome contributions! To get started:

1. Fork the repository.
2. Create your feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request.

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

> Made with ❤️ by Imranch4 for the Discord community.  
> For questions or support, open an issue in this repository!

## License
This project is licensed under the **MIT** License.

---
🔗 GitHub Repo: https://github.com/Imranch4/discord-stream-bot****
