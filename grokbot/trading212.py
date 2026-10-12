"""Trading 212 (solo lectura). Credenciales únicamente desde entorno/.env o campos de la sesión;
nunca se escriben a disco ni se registran. Las órdenes siguen siendo paper trading local."""
import base64

import requests

from .config import t212_creds


def _base(env):
    return f"https://{'live' if env == 'live' else 'demo'}.trading212.com/api/v0"


def _auth(key, secret):
    # Con key+secret se usa Basic; si solo hay key (esquema antiguo) va directa.
    if secret:
        return "Basic " + base64.b64encode(f"{key}:{secret}".encode()).decode()
    return key


def configured(session_creds=None) -> bool:
    k, s, _ = session_creds or t212_creds()
    return bool(k)


def summary(session_creds=None):
    """Devuelve (datos|None, error|None) con saldo y posiciones reales para comparar."""
    k, s, env = session_creds or t212_creds()
    if not k:
        return None, "Sin credenciales"
    h = {"Authorization": _auth(k, s)}
    try:
        cash = requests.get(_base(env) + "/equity/account/cash", headers=h, timeout=8)
        if cash.status_code != 200:
            return None, f"HTTP {cash.status_code} (revisa credenciales/entorno)"
        pos = requests.get(_base(env) + "/equity/portfolio", headers=h, timeout=8)
        return dict(cash=cash.json(), positions=pos.json() if pos.ok else [], env=env), None
    except Exception as e:
        return None, type(e).__name__
