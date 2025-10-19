module.exports = {
  apps: [{
    name: "stream-bot",
    script: "./optimizedMain.js",
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "500M",
    node_args: "--max_old_space_size=512",
    env: {
      NODE_ENV: "production"
    },
    error_file: "./logs/pm2-error.log",
    out_file: "./logs/pm2-out.log",
    log_file: "./logs/pm2-combined.log",
    time: true,
    
    autorestart: true,
    watch: false,
    ignore_watch: ["node_modules", "logs"],
    
    instance_var: 'INSTANCE_ID',
    listen_timeout: 5000,
    kill_timeout: 5000
  }]
};