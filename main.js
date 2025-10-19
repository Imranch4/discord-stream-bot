const MasterStreamBot = require('./bots/mainBot');
const logger = require('./lib/logger');

setInterval(() => {
    if (global.gc) {
        global.gc();
    }
}, 300000);

logger.info('Starting Optimized Stream Bot...');

const bot = new MasterStreamBot();

bot.login().catch(error => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
});

process.on('SIGINT', () => {
    logger.info('Graceful shutdown...');
    process.exit(0);
});