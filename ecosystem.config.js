module.exports = {
  apps: [
    {
      name: "netguard-backend",
      cwd: "/home/mariem/Desktop/NetGuard-PFE/backend",
      script: "/home/mariem/Desktop/NetGuard-PFE/backend/venv/bin/python",
      args: "app.py",
      watch: false,
      autorestart: true
    },
    {
      name: "netguard-frontend",
      cwd: "/home/mariem/Desktop/NetGuard-PFE/frontend",
      script: "pnpm",
      args: "dev",
      watch: false,
      autorestart: true
    }
  ]
}
