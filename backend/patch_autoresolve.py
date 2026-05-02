import shutil, datetime, sys

path = 'routes/audits.py'
shutil.copy(path, f'{path}.bak-autoresolve-{datetime.datetime.now().strftime("%H%M%S")}')

with open(path) as f:
    src = f.read()

if 'AUTO-RESOLVE' in src:
    print("Patch deja applique - skip")
    sys.exit(0)

marker1 = '''            query(
                "UPDATE audits SET status = 'completed', anomalies_found = %s, completed_at = NOW() WHERE id = %s",
                (len(anomalies), audit_id)
            )
            query("UPDATE devices SET last_audit_at = NOW() WHERE id = %s", (device["id"],))'''

new1 = '''            query(
                "UPDATE audits SET status = 'completed', anomalies_found = %s, completed_at = NOW() WHERE id = %s",
                (len(anomalies), audit_id)
            )
            # AUTO-RESOLVE
            _new_types = query("SELECT DISTINCT anomaly_type FROM audit_results WHERE audit_id = %s", (audit_id,), fetchall=True) or []
            _detected = [r["anomaly_type"] for r in _new_types]
            if _detected:
                _ph = ','.join(['%s'] * len(_detected))
                query(
                    f"UPDATE audit_results SET status='corrected', corrected_at=NOW() WHERE device_id=%s AND status='open' AND audit_id!=%s AND anomaly_type NOT IN ({_ph})",
                    tuple([device["id"], audit_id] + _detected)
                )
            else:
                query(
                    "UPDATE audit_results SET status='corrected', corrected_at=NOW() WHERE device_id=%s AND status='open' AND audit_id!=%s",
                    (device["id"], audit_id)
                )
            query("UPDATE devices SET last_audit_at = NOW() WHERE id = %s", (device["id"],))'''

marker2 = '''        query(
            """UPDATE audits
               SET status = 'completed', anomalies_found = %s,
                   completed_at = NOW()
               WHERE id = %s""",
            (len(anomalies), audit_id)
        )

        # Mise à jour de la date du dernier audit sur l'équipement
        query(
            "UPDATE devices SET last_audit_at = NOW() WHERE id = %s",
            (device["id"],)
        )'''

new2 = '''        query(
            """UPDATE audits
               SET status = 'completed', anomalies_found = %s,
                   completed_at = NOW()
               WHERE id = %s""",
            (len(anomalies), audit_id)
        )

        # AUTO-RESOLVE
        _new_types = query("SELECT DISTINCT anomaly_type FROM audit_results WHERE audit_id = %s", (audit_id,), fetchall=True) or []
        _detected = [r["anomaly_type"] for r in _new_types]
        if _detected:
            _ph = ','.join(['%s'] * len(_detected))
            query(
                f"UPDATE audit_results SET status='corrected', corrected_at=NOW() WHERE device_id=%s AND status='open' AND audit_id!=%s AND anomaly_type NOT IN ({_ph})",
                tuple([device["id"], audit_id] + _detected)
            )
        else:
            query(
                "UPDATE audit_results SET status='corrected', corrected_at=NOW() WHERE device_id=%s AND status='open' AND audit_id!=%s",
                (device["id"], audit_id)
            )

        query(
            "UPDATE devices SET last_audit_at = NOW() WHERE id = %s",
            (device["id"],)
        )'''

if marker1 in src:
    src = src.replace(marker1, new1, 1)
    print("OK Patch 1 applique")
else:
    print("ERREUR Marqueur 1 introuvable")
    sys.exit(1)

if marker2 in src:
    src = src.replace(marker2, new2, 1)
    print("OK Patch 2 applique")
else:
    print("ERREUR Marqueur 2 introuvable")
    sys.exit(1)

with open(path, 'w') as f:
    f.write(src)

print("OK termine - REDEMARRER Flask maintenant")
