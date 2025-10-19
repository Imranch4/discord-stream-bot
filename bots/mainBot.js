const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const { spawn } = require('child_process');
const config = require('../config/config.json');
const channelConfig = require('../channels/all_channels.json');
const logger = require('../lib/logger');

class MasterStreamBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });
        
        this.players = new Map(); 
        this.currentStreams = new Map();
        this.voiceConnections = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.on('clientReady', () => {
            logger.info(`Master Bot ${this.client.user.tag} is online!`);
            this.setupPresence();
            this.registerCommands();
            this.startHealthChecks();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (interaction.isCommand()) {
                await this.handleCommand(interaction);
            } else if (interaction.isButton()) {
                await this.handleButton(interaction);
            }
        });

        this.client.on('voiceStateUpdate', (oldState, newState) => {
            this.handleVoiceStateUpdate(oldState, newState);
        });
    }

    async registerCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('stream')
                .setDescription('Manage streaming')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('play')
                        .setDescription('Play channel stream')
                        .addStringOption(option =>
                            option.setName('channel')
                                .setDescription('Name channel')
                                .setRequired(true)
                                .addChoices(...this.getChannelChoices())
                        )
                        .addChannelOption(option =>
                            option.setName('voice_channel')
                                .setDescription('Voice room')
                                .addChannelTypes(ChannelType.GuildVoice)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('stop')
                        .setDescription('Stop the current stream')
                        .addStringOption(option =>
                            option.setName('channel')
                                .setDescription('Channel name')
                                .setRequired(false)
                                .addChoices(...this.getChannelChoices())
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('show list channel Stream')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('show status all streams' )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('volume')
                        .setDescription('Set volume level')
                        .addStringOption(option =>
                            option.setName('channel')
                                .setDescription('Channel name')
                                .setRequired(true)
                                .addChoices(...this.getChannelChoices())
                        )
                        .addNumberOption(option =>
                            option.setName('level')
                                .setDescription('Volume level (0.1 - 2.0)')
                                .setRequired(true)
                                .setMinValue(0.1)
                                .setMaxValue(2.0)
                        )
                ),

            new SlashCommandBuilder()
                .setName('next')
                .setDescription('Switch to the next backup link')
                .addStringOption(option =>
                    option.setName('channel')
                        .setDescription('Channel name')
                        .setRequired(true)
                        .addChoices(...this.getChannelChoices())
                ),

            new SlashCommandBuilder()
                .setName('setup')
                .setDescription('System setup (Admins only)')
        ];

        const rest = new REST({ version: '10' }).setToken(config.bot.token);
        
        try {
            await rest.put(
                Routes.applicationGuildCommands(config.bot.clientId, config.discord.guildId),
                { body: commands }
            );
            logger.info('Slash commands registered for Master Bot');
        } catch (error) {
            logger.error('Error registering commands:', error);
        }
    }

    getChannelChoices() {
        return channelConfig.channels
            .filter(ch => ch.enabled)
            .map(ch => ({ name: ch.displayName, value: ch.name }));
    }

    getChannelConfig(channelName) {
        return channelConfig.channels.find(ch => ch.name === channelName && ch.enabled);
    }

    async handleCommand(interaction) {
        const { commandName, options } = interaction;

        try {
            switch (commandName) {
                case 'stream':
                    await this.handleStreamCommand(interaction, options);
                    break;
                case 'next':
                    await this.nextStream(interaction, options.getString('channel'));
                    break;
                case 'setup':
                    await this.setupSystem(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Command error:', error);
            await interaction.reply({ 
                content: 'Probleme in the streaùm execution. Please try again later.', 
                ephemeral: true 
            });
        }
    }

    async handleStreamCommand(interaction, options) {
        const subcommand = options.getSubcommand();

        switch (subcommand) {
            case 'play':
                await this.playChannel(interaction, 
                    options.getString('channel'), 
                    options.getChannel('voice_channel')
                );
                break;
            case 'stop':
                await this.stopChannel(interaction, options.getString('channel'));
                break;
            case 'list':
                await this.listChannels(interaction);
                break;
            case 'status':
                await this.showAllStatus(interaction);
                break;
            case 'volume':
                await this.setChannelVolume(interaction, 
                    options.getString('channel'),
                    options.getNumber('level')
                );
                break;
        }
    }

    async playChannel(interaction, channelName, voiceChannel = null) {
        await interaction.deferReply();
        
        const channelConfig = this.getChannelConfig(channelName);
        if (!channelConfig) {
            return await interaction.editReply('Channel not found or disabled.');
        }

        const targetVoiceChannel = voiceChannel || interaction.member.voice.channel;
        if (!targetVoiceChannel) {
            return await interaction.editReply('You must join a voice channel first or specify a channel.');
        }

        if (this.currentStreams.has(channelName)) {
            return await interaction.editReply('This channel is already playing! Use `/next` to switch between links.');
        }

        try {
            await this.startStream(channelConfig, targetVoiceChannel);
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('Stream started successfully')
                .setDescription(`**${channelConfig.displayName}**`)
                .addFields(
                    { name: 'Voice Channel', value: targetVoiceChannel.name, inline: true },
                    { name: 'Quality', value: channelConfig.quality || 'HD', inline: true },
                    { name: 'Link', value: `\`${channelConfig.streams[0]}\``, inline: false }
                )
                .setFooter({ text: `Use /next ${channelName} to switch between links` })
                .setTimestamp();

            await interaction.editReply({ 
                embeds: [embed],
                components: [this.createChannelControls(channelName)]
            });
            
        } catch (error) {
            logger.error(`Play error for ${channelName}:`, error);
            await interaction.editReply('Failed to play the channel - trying backup links...');
        }
    }

    async startStream(channelConfig, voiceChannel) {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false
        });

        const audioPlayer = createAudioPlayer();
        this.setupPlayerEvents(audioPlayer, channelConfig.name);

        connection.subscribe(audioPlayer);
        
        await this.playStreamUrl(channelConfig, audioPlayer, 0);
        
        this.voiceConnections.set(channelConfig.name, connection);
        this.players.set(channelConfig.name, audioPlayer);
        this.currentStreams.set(channelConfig.name, {
            config: channelConfig,
            currentIndex: 0,
            voiceChannel: voiceChannel,
            startTime: Date.now()
        });

        logger.info(`📺 Started stream: ${channelConfig.displayName} in ${voiceChannel.name}`);
    }

    async playStreamUrl(channelConfig, audioPlayer, streamIndex) {
        const streamUrl = channelConfig.streams[streamIndex];
        
        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-i', streamUrl,
                '-analyzeduration', '0',
                '-loglevel', '0',
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '2',
                '-af', `volume=${channelConfig.volume || 1.0}`,
                'pipe:1'
            ];

            const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
            
            ffmpegProcess.stdout.on('data', () => {
                const resource = createAudioResource(ffmpegProcess.stdout, {
                    inputType: StreamType.Raw,
                    inlineVolume: false
                });
                
                audioPlayer.play(resource);
                resolve();
            });

            ffmpegProcess.stderr.on('data', (data) => {
                logger.debug(`FFmpeg ${channelConfig.name}: ${data}`);
            });

            ffmpegProcess.on('error', (error) => {
                reject(error);
            });

            ffmpegProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            const streamData = this.currentStreams.get(channelConfig.name);
            if (streamData) {
                streamData.currentProcess = ffmpegProcess;
            }
        });
    }

    setupPlayerEvents(audioPlayer, channelName) {
        audioPlayer.on(AudioPlayerStatus.Idle, () => {
            this.retryStream(channelName);
        });

        audioPlayer.on('error', (error) => {
            logger.error(`Player error for ${channelName}:`, error);
            this.retryStream(channelName);
        });
    }

    async retryStream(channelName) {
        const streamData = this.currentStreams.get(channelName);
        if (!streamData) return;

        streamData.currentIndex++;
        
        if (streamData.currentIndex >= streamData.config.streams.length) {
            logger.error(`All streams failed for ${channelName}`);
            this.stopChannelStream(channelName);
            return;
        }

        logger.info(`Retrying ${channelName} with backup ${streamData.currentIndex + 1}`);
        
        try {
            await this.playStreamUrl(streamData.config, this.players.get(channelName), streamData.currentIndex);
        } catch (error) {
            setTimeout(() => this.retryStream(channelName), config.streamSettings.retryDelay);
        }
    }

    async stopChannel(interaction, channelName = null) {
        await interaction.deferReply();
        
        if (channelName) {
            this.stopChannelStream(channelName);
            await interaction.editReply(`Stopped stream **${channelName}**`);
        } else {
            const stoppedChannels = [];
            for (const [name] of this.currentStreams) {
                this.stopChannelStream(name);
                stoppedChannels.push(name);
            }
            
            if (stoppedChannels.length > 0) {
                await interaction.editReply(`Stopped **${stoppedChannels.length}** streams: ${stoppedChannels.join(', ')}`);
            } else {
                await interaction.editReply('No active streams found');
            }
        }
    }

    stopChannelStream(channelName) {
        const player = this.players.get(channelName);
        const connection = this.voiceConnections.get(channelName);
        const streamData = this.currentStreams.get(channelName);

        if (player) {
            player.stop();
            this.players.delete(channelName);
        }

        if (connection) {
            connection.destroy();
            this.voiceConnections.delete(channelName);
        }

        if (streamData && streamData.currentProcess) {
            streamData.currentProcess.kill();
        }

        this.currentStreams.delete(channelName);
        logger.info(`Stopped stream: ${channelName}`);
    }

    async nextStream(interaction, channelName) {
        await interaction.deferReply();
        
        const streamData = this.currentStreams.get(channelName);
        if (!streamData) {
            return await interaction.editReply('No active stream found for this channel');
        }

        streamData.currentIndex = (streamData.currentIndex + 1) % streamData.config.streams.length;
        const player = this.players.get(channelName);
        
        try {
            player.stop();
            await this.playStreamUrl(streamData.config, player, streamData.currentIndex);

            await interaction.editReply(`Switched to link ${streamData.currentIndex + 1}/${streamData.config.streams.length}`);
        } catch (error) {
            await interaction.editReply('Failed to switch to the next link');
        }
    }

    async listChannels(interaction) {
        const channels = channelConfig.channels.filter(ch => ch.enabled);
        
        const categories = {};
        channels.forEach(channel => {
            if (!categories[channel.category]) {
                categories[channel.category] = [];
            }
            categories[channel.category].push(channel);
        });

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Available Channels')
            .setDescription(`All **${channels.length}** active channels`)
            .setFooter({ text: 'Use /stream play <channel_name> to start' })
            .setTimestamp();

        for (const [category, categoryChannels] of Object.entries(categories)) {
            embed.addFields({
                name: `${category}`,
                value: categoryChannels.map(ch => 
                    `**${ch.displayName}**\n\`/stream play ${ch.name}\``
                ).join('\n'),
                inline: true
            });
        }

        await interaction.reply({ embeds: [embed] });
    }

    async showAllStatus(interaction) {
        const activeStreams = Array.from(this.currentStreams.entries());
        
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('System Status')
            .setDescription(`**${activeStreams.length}** active streams out of **${channelConfig.channels.filter(ch => ch.enabled).length}** channels`)
            .setTimestamp();

        if (activeStreams.length === 0) {
            embed.addFields({
                name: 'No active streams found',
                value: 'Use `/stream list` to see available channels'
            });
        } else {
            activeStreams.forEach(([name, data]) => {
                const uptime = Math.floor((Date.now() - data.startTime) / 1000);
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                embed.addFields({
                    name: `${data.config.displayName}`,
                    value: `**Room:** ${data.voiceChannel.name}\n**Link:** ${data.currentIndex + 1}/${data.config.streams.length}\n**Duration:** ${hours}h ${minutes}m`,
                    inline: true
                });
            });
        }

        await interaction.reply({ embeds: [embed] });
    }

    createChannelControls(channelName) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`stop_${channelName}`)
                    .setLabel('Stop')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`next_${channelName}`)
                    .setLabel('Next Link')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`status_${channelName}`)
                    .setLabel('Status')
                    .setStyle(ButtonStyle.Secondary)
            );

        return row;
    }

    async handleButton(interaction) {
        const [action, channelName] = interaction.customId.split('_');
        
        switch (action) {
            case 'stop':
                this.stopChannelStream(channelName);
                await interaction.reply({ content: `Stopped ${channelName}`, ephemeral: true });
                break;
            case 'next':
                await this.nextStream(interaction, channelName);
                break;
            case 'status':
                await this.showChannelStatus(interaction, channelName);
                break;
        }
    }

    setupPresence() {
        this.client.user.setPresence({
            activities: [{
                name: `${channelConfig.channels.filter(ch => ch.enabled).length} Stream Channels`,
                type: 1
            }],
            status: 'online'
        });
    }

    startHealthChecks() {
        setInterval(() => {
            this.checkStreamsHealth();
        }, config.streamSettings.checkInterval);
    }

    checkStreamsHealth() {
        logger.debug('Health check completed');
    }

    login() {
        return this.client.login(config.bot.token);
    }
}

module.exports = MasterStreamBot;