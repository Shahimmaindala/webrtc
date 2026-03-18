module.exports = {
  apps: [
    {
      name: 'nextjs-app',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      name: 'signaling-server',
      script: 'signaling-server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};