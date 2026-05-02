"""
Route d'export — rapport d'audit JSON et PDF.
"""

import json
from datetime import datetime
from flask import Blueprint, jsonify, request, make_response
from db import query
from routes.auth import require_auth

export_bp = Blueprint("export", __name__)

SEV_WEIGHT = {"critical": 40, "high": 25, "medium": 15, "low": 5}


def _risk_score(anomalies):
    return min(100, sum(SEV_WEIGHT.get(a.get("severity", ""), 0) for a in anomalies if a.get("status") == "open"))


@export_bp.route("/export/report", methods=["GET"])
@require_auth
def export_report():
    """Export complet du rapport d'audit en JSON."""
    device_id = request.args.get("deviceId")
    audit_id = request.args.get("auditId")

    sql = """
        SELECT ar.*, d.name AS device_name, d.ip_address, d.vendor, d.type AS device_type
        FROM audit_results ar
        LEFT JOIN devices d ON d.id = ar.device_id
        WHERE 1=1
    """
    params = []
    if device_id and device_id not in ("undefined", "null", ""):
        try:
            sql += " AND ar.device_id = %s"
            params.append(int(device_id))
        except ValueError:
            pass
    if audit_id:
        try:
            sql += " AND ar.audit_id = %s"
            params.append(int(audit_id))
        except ValueError:
            pass
    sql += " ORDER BY ar.detected_at DESC"

    rows = query(sql, params, fetchall=True) or []

    results = [
        {
            "id": r["id"],
            "auditId": r["audit_id"],
            "deviceName": r.get("device_name", ""),
            "ipAddress": r.get("ip_address", ""),
            "vendor": r.get("vendor", ""),
            "deviceType": r.get("device_type", ""),
            "anomalyType": r["anomaly_type"],
            "severity": r["severity"],
            "description": r["description"],
            "affectedConfig": r["affected_config"],
            "suggestedFix": r["suggested_fix"],
            "status": r["status"],
            "detectedAt": r["detected_at"].isoformat() if r["detected_at"] else None,
            "correctedAt": r["corrected_at"].isoformat() if r["corrected_at"] else None,
        }
        for r in rows
    ]

    devices_map: dict = {}
    for r in results:
        name = r["deviceName"]
        if name not in devices_map:
            devices_map[name] = []
        devices_map[name].append(r)

    device_summaries = [
        {
            "deviceName": name,
            "ipAddress": items[0]["ipAddress"],
            "vendor": items[0]["vendor"],
            "totalAnomalies": len(items),
            "openAnomalies": sum(1 for i in items if i["status"] == "open"),
            "riskScore": _risk_score(items),
            "anomalies": items,
        }
        for name, items in devices_map.items()
    ]
    device_summaries.sort(key=lambda x: x["riskScore"], reverse=True)

    report = {
        "meta": {
            "title": "Rapport d'Audit NetGuard",
            "system": "AI-Based Network Configuration Audit — Zero-Touch Automation",
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "version": "v2.1.0",
            "standards": ["CIS Benchmarks", "NIST SP 800-115"],
        },
        "summary": {
            "totalAnomalies": len(results),
            "openAnomalies": sum(1 for r in results if r["status"] == "open"),
            "correctedAnomalies": sum(1 for r in results if r["status"] == "corrected"),
            "criticalCount": sum(1 for r in results if r["severity"] == "critical" and r["status"] == "open"),
            "highCount": sum(1 for r in results if r["severity"] == "high" and r["status"] == "open"),
            "devicesAffected": len(devices_map),
        },
        "deviceReports": device_summaries,
    }

    resp = make_response(json.dumps(report, ensure_ascii=False, indent=2))
    resp.headers["Content-Type"] = "application/json; charset=utf-8"
    resp.headers["Content-Disposition"] = (
        f'attachment; filename="netguard_report_{datetime.utcnow().strftime("%Y%m%d_%H%M")}.json"'
    )
    return resp
