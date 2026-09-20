module.exports = {
  apps: [{
    name: 'panel-api',
    script: 'server.js',
    cwd: '/home/youruser/panel-api',
    env: { NODE_ENV: 'production' },
    watch: false,
    autorestart: true,
    max_memory_restart: '300M'
  }]
};
