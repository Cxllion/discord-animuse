module.exports = {
  apps: [
    {
      name: 'animuse-main',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        BOT_TYPE: 'main'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/main-error.log',
      out_file: 'logs/main-out.log',
      combine_logs: true,
      time: true
    },
    {
      name: 'animuse-core',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        BOT_TYPE: 'core'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/core-error.log',
      out_file: 'logs/core-out.log',
      combine_logs: true,
      time: true
    }
  ]
};
