"""
NetGuard — Serveur API Flask
Système de détection et correction d'anomalies réseau Zero-Touch

Démarrage :
    pip install -r requirements.txt
    python app.py
"""

import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from routes.auth import auth_bp
from routes.devices import devices_bp
from routes.audits import audits_bp
from routes.results import results_bp
from routes.corrections import corrections_bp
from routes.dashboard import dashboard_bp
from routes.users import users_bp
from routes.topology import topology_bp
from routes.ssh_routes import ssh_bp
from routes.health import health_bp
from routes.scheduler import scheduler_bp, start_scheduler
from routes.export import export_bp
from routes.policies import policies_bp

load_dotenv()


def create_app():
    app = Flask(__name__)

    # Autoriser les requêtes cross-origin depuis le frontend React
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # Enregistrement de tous les blueprints sous le préfixe /api
    blueprints = [
        auth_bp, devices_bp, audits_bp, results_bp,
        corrections_bp, dashboard_bp, users_bp,
        topology_bp, ssh_bp, health_bp, scheduler_bp, export_bp, policies_bp,
    ]
    for bp in blueprints:
        app.register_blueprint(bp, url_prefix="/api")

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Route introuvable."}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Erreur interne du serveur.", "detail": str(e)}), 500

    @app.errorhandler(Exception)
    def unhandled(e):
        return jsonify({"error": str(e) or "Erreur inattendue."}), 500

    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app = create_app()

    # Démarrage du planificateur d'audits automatiques
    start_scheduler()
    print("[NetGuard] Planificateur d'audits Zero-Touch démarré.")

    print(f"[NetGuard] Serveur Flask démarré sur le port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
