const https = require('https');
const http = require('http');
const logger = require('./logger');

class StreamChecker {
    constructor(channels) {
        this.channels = channels;
        this.streamStatus = new Map();
    }

    async checkAllStreams() {
        const results = [];
        
        for (const channel of this.channels) {
            if (!channel.enabled) continue;
            
            const status = await this.checkChannelStreams(channel);
            results.push(status);
            
            this.handleStatusChange(channel, status);
        }
        
        return results;
    }

    async checkChannelStreams(channel) {
        const status = {
            channel: channel.name,
            streams: [],
            healthy: false
        };

        for (let i = 0; i < channel.streams.length; i++) {
            const streamUrl = channel.streams[i];
            const isHealthy = await this.checkStreamHealth(streamUrl);
            
            status.streams.push({
                url: streamUrl,
                index: i,
                healthy: isHealthy
            });

            if (isHealthy) {
                status.healthy = true;
                status.workingStream = streamUrl;
                break;
            }
        }

        this.streamStatus.set(channel.name, status);
        return status;
    }

    async checkStreamHealth(streamUrl, timeout = 10000) {
        return new Promise((resolve) => {
            const protocol = streamUrl.startsWith('https') ? https : http;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                resolve(false);
            }, timeout);

            protocol.get(streamUrl, { signal: controller.signal }, (response) => {
                clearTimeout(timeoutId);
                
                const isHealthy = response.statusCode >= 200 && response.statusCode < 400;
                resolve(isHealthy);
                
            }).on('error', (error) => {
                clearTimeout(timeoutId);
                logger.debug(`Stream check failed: ${error.message}`);
                resolve(false);
            });
        });
    }

    handleStatusChange(channel, newStatus) {
        const oldStatus = this.streamStatus.get(channel.name);
        
        if (!oldStatus || oldStatus.healthy !== newStatus.healthy) {
            const message = newStatus.healthy ? 
                `Channel ${channel.displayName} back online` :
                `Channel ${channel.displayName} offline`;
            
            logger.warn(message);
        }
    }

    getChannelStatus(channelName) {
        return this.streamStatus.get(channelName);
    }

    getAllStatus() {
        return Array.from(this.streamStatus.entries());
    }
}

module.exports = StreamChecker;