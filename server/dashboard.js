const express = require('express');
const path = require('path');
const basicAuth = require('express-basic-auth');
const config = require('../config/config.json');

class Dashboard {
    constructor(bots) {
        this.app = express();
        this.bots = bots;
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        if (config.dashboard.auth) {
            this.app.use(basicAuth({
                users: { [config.dashboard.auth.username]: config.dashboard.auth.password },
                challenge: true
            }));
        }
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        this.app.get('/api/status', (req, res) => {
            const status = this.getOverallStatus();
            res.json(status);
        });

        this.app.post('/api/bot/:botName/play', (req, res) => {
            res.json({ success: true });
        });

        this.app.post('/api/bot/:botName/stop', (req, res) => {
            res.json({ success: true });
        });
    }

    getOverallStatus() {
        const status = {
            bots: [],
            totalChannels: 0,
            onlineChannels: 0,
            offlineChannels: 0
        };

        for (const bot of this.bots) {
            const botStatus = bot.playerManager.getStatus();
            status.bots.push({
                name: bot.config.name,
                status: botStatus,
                uptime: process.uptime()
            });
        }

        return status;
    }

    start() {
        this.app.listen(config.dashboard.port, () => {
            logger.info(`Dashboard running on port ${config.dashboard.port}`);
        });
    }
}

module.exports = Dashboard;