module.exports = {
  apps: [
    {
      name: 'tolongin-backend',
      script: 'dist/src/main.js',
      instances: 1, // Use 'max' for cluster mode if you have multiple CPU cores
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
