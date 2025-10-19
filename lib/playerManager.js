const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const logger = require('./logger');

class PlayerManager {
    constructor(config) {
        this.config = config;
        this.audioPlayer = createAudioPlayer();
        this.voiceConnection = null;
        this.currentStream = null;
        this.currentChannel = null;
        this.currentStreamIndex = 0;
        this.retryCount = 0;
        this.volume = 1.0;
        
        this.setupPlayerEvents();
    }

    setupPlayerEvents() {
        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.currentChannel) {
                this.handleStreamEnd();
            }
        });

        this.audioPlayer.on('error', (error) => {
            logger.error('Audio player error:', error);
            this.handleStreamError();
        });
    }

    async playStream(channelConfig, voiceChannel) {
        try {
            this.currentChannel = channelConfig;
            this.currentStreamIndex = 0;
            this.retryCount = 0;

            this.voiceConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false
            });

            await this.playCurrentStream();
            
        } catch (error) {
            logger.error('Play stream error:', error);
            throw error;
        }
    }

    async playCurrentStream() {
        if (!this.currentChannel || this.currentStreamIndex >= this.currentChannel.streams.length) {
            logger.error('No valid streams available');
            return false;
        }

        const streamUrl = this.currentChannel.streams[this.currentStreamIndex];
        
        try {
            const audioResource = await this.createStreamResource(streamUrl);
            this.voiceConnection.subscribe(this.audioPlayer);
            this.audioPlayer.play(audioResource);
            
            logger.info(`Playing stream: ${streamUrl}`);
            return true;
            
        } catch (error) {
            logger.error(`Stream error: ${error}`);
            return await this.retryStream();
        }
    }

    async createStreamResource(streamUrl) {
        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-i', streamUrl,
                '-analyzeduration', '0',
                '-loglevel', '0',
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '2',
                '-af', `volume=${this.volume}`,
                'pipe:1'
            ];

            const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
            this.currentProcess = ffmpegProcess;

            ffmpegProcess.stdout.on('data', () => {
                const resource = createAudioResource(ffmpegProcess.stdout, {
                    inputType: StreamType.Raw,
                    inlineVolume: false
                });
                resolve(resource);
            });

            ffmpegProcess.stderr.on('data', (data) => {
                logger.debug(`FFmpeg: ${data}`);
            });

            ffmpegProcess.on('error', (error) => {
                reject(error);
            });

            ffmpegProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                }
            });
        });
    }

    async retryStream() {
        this.retryCount++;
        
        if (this.retryCount >= this.config.streamSettings.maxRetries) {
            this.currentStreamIndex++;
            this.retryCount = 0;
        }

        if (this.currentStreamIndex >= this.currentChannel.streams.length) {
            logger.error('All streams failed');
            this.stopStream();
            return false;
        }

        logger.info(`Retrying with backup stream ${this.currentStreamIndex + 1}`);
        
        setTimeout(() => {
            this.playCurrentStream();
        }, this.config.streamSettings.retryDelay);

        return true;
    }

    stopStream() {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = null;
        }
        
        this.audioPlayer.stop();
        
        if (this.voiceConnection) {
            this.voiceConnection.destroy();
            this.voiceConnection = null;
        }
        
        this.currentChannel = null;
        this.currentStreamIndex = 0;
        this.retryCount = 0;
    }

    async nextStream() {
        if (!this.currentChannel) return false;

        this.currentStreamIndex = (this.currentStreamIndex + 1) % this.currentChannel.streams.length;
        this.retryCount = 0;
        
        this.audioPlayer.stop();
        return await this.playCurrentStream();
    }

    setVolume(level) {
        this.volume = Math.max(0.1, Math.min(2.0, level));
        if (this.currentChannel) {
            this.nextStream();
        }
    }

    getStatus() {
        return {
            channel: this.currentChannel ? this.currentChannel.displayName : null,
            isPlaying: this.audioPlayer.state.status === AudioPlayerStatus.Playing,
            currentStream: this.currentChannel ? this.currentChannel.streams[this.currentStreamIndex] : null,
            streamIndex: this.currentStreamIndex + 1,
            totalStreams: this.currentChannel ? this.currentChannel.streams.length : 0,
            volume: this.volume,
            listeners: this.voiceConnection ? this.voiceConnection.joinConfig.channelId : 0
        };
    }

    handleStreamEnd() {
        logger.info('Stream ended, retrying...');
        this.retryStream();
    }

    handleStreamError() {
        logger.error('Stream error occurred');
        this.retryStream();
    }
}

module.exports = PlayerManager;