#!/bin/bash
echo "Démarrage NetGuard..."

# Backend
cd ~/Desktop/NetGuard-PFE/backend
source venv/bin/activate
python app.py &

# Frontend
cd ~/Desktop/NetGuard-PFE/frontend
npm run dev
