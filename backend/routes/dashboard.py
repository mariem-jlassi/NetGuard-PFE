"""
Route du tableau de bord — statistiques globales de l'application.
"""

from flask import Blueprint, jsonify
from db import query

dashboard_bp = Blueprint("dashboard", __name__)

SEV_WEIGHT = {"critical": 40, "high": 25, "medium": 15, "low": 5}


def _compute_risk_scores():
    rows = query(
        """SELECT d.id, d.name, d.vendor, d.ip_address,
                  ar.severity, COUNT(ar.id) AS cnt
           FROM devices d
           LEFT JOIN audit_results ar ON ar.device_id = d.id AND ar.status = 'open'
           GROUP BY d.id, d.name, d.vendor, d.ip_address, ar.severity
           ORDER BY d.id""",
        fetchall=True
    ) or []

    device_map: dict = {}
    for r in rows:
        did = r["id"]
        if did not in device_map:
            device_map[did] = {
                "deviceId": did,
                "deviceName": r["name"],
                "vendor": r["vendor"] or "",
                "ipAddress": r["ip_address"] or "",
                "score": 0,
            }
        if r["severity"]:
            pts = SEV_WEIGHT.get(r["severity"], 0) * r["cnt"]
            device_map[did]["score"] = min(100, device_map[did]["score"] + pts)

    result = sorted(device_map.values(), key=lambda x: x["score"], reverse=True)
    return result


@dashboard_bp.route("/dashboard/stats", methods=["GET"])
def get_stats():
    total_devices = query("SELECT COUNT(*) AS c FROM devices", fetchone=True)["c"]
    total_audits = query("SELECT COUNT(*) AS c FROM audits", fetchone=True)["c"]
    open_anomalies = query(
        """SELECT COUNT(*) AS c FROM audit_results ar
           LEFT JOIN security_policies sp ON UPPER(ar.anomaly_type) = sp.rule_id
           WHERE ar.status = 'open' AND (sp.is_enabled = TRUE OR sp.rule_id IS NULL)""",
        fetchone=True
    )["c"]
    corrected = query(
        "SELECT COUNT(*) AS c FROM audit_results WHERE status = 'corrected'",
        fetchone=True
    )["c"]
    risk_scores = _compute_risk_scores()
    critical_anomalies = sum(1 for d in risk_scores if d["score"] >= 70)

    by_severity = query(
        """SELECT severity, COUNT(*) AS count
           FROM audit_results WHERE status = 'open'
           GROUP BY severity ORDER BY
           CASE severity
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
             ELSE 5
           END""",
        fetchall=True
    ) or []

    by_device = query(
        """SELECT d.name, COUNT(ar.id) AS count
           FROM audit_results ar
           JOIN devices d ON d.id = ar.device_id
           WHERE ar.status = 'open'
           GROUP BY d.name
           ORDER BY count DESC
           LIMIT 8""",
        fetchall=True
    ) or []

    recent_audits = query(
        """SELECT a.id, a.status, a.anomalies_found, a.created_at, d.name AS device_name
           FROM audits a
           LEFT JOIN devices d ON d.id = a.device_id
           ORDER BY a.created_at DESC LIMIT 5""",
        fetchall=True
    ) or []

    device_risk_scores = risk_scores

    return jsonify({
        "totalDevices": total_devices,
        "totalAudits": total_audits,
        "openAnomalies": open_anomalies,
        "correctedAnomalies": corrected,
        "criticalAnomalies": critical_anomalies,
        "anomaliesBySeverity": [
            {"severity": r["severity"], "count": r["count"]} for r in by_severity
        ],
        "anomaliesByDevice": [
            {"deviceName": r["name"], "count": r["count"]} for r in by_device
        ],
        "recentAudits": [
            {
                "id": r["id"],
                "deviceName": r["device_name"],
                "status": r["status"],
                "anomaliesFound": r["anomalies_found"],
                "createdAt": r["created_at"].isoformat(),
            }
            for r in recent_audits
        ],
        "deviceRiskScores": device_risk_scores,
    })
