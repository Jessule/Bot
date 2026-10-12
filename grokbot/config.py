"""Configuración central. Los secretos se leen SOLO de variables de entorno / .env."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)


def _load_dotenv():
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

START_CASH = 10_000.0

# symbol -> metadata. yf = ticker de Yahoo, bn = par de Binance (order book real)
ASSETS = {
    "AAPL": dict(name="Apple", cls="Acción", yf="AAPL", max_lev=1),
    "MSFT": dict(name="Microsoft", cls="Acción", yf="MSFT", max_lev=1),
    "NOW":  dict(name="ServiceNow", cls="Acción", yf="NOW", max_lev=1),
    "SHOP": dict(name="Shopify", cls="Acción", yf="SHOP", max_lev=1),
    "MU":   dict(name="Micron", cls="Acción", yf="MU", max_lev=1),
    "AAOI": dict(name="Applied Opto", cls="Acción", yf="AAOI", max_lev=1),
    "BTC":  dict(name="Bitcoin", cls="Crypto", yf="BTC-USD", bn="BTCUSDT", max_lev=10),
    "SOL":  dict(name="Solana", cls="Crypto", yf="SOL-USD", bn="SOLUSDT", max_lev=10),
    "XRP":  dict(name="XRP", cls="Crypto", yf="XRP-USD", bn="XRPUSDT", max_lev=10),
    "GOLD": dict(name="Oro", cls="Metal", yf="GC=F", max_lev=5),
    "SILVER": dict(name="Plata", cls="Metal", yf="SI=F", max_lev=5),
}

# Umbral de "movimiento fuerte" del Scout (% de cambio en la ventana) por clase
SCOUT_THRESHOLD = {"Acción": 1.0, "Crypto": 1.5, "Metal": 0.8}
SCOUT_INTERVAL_S = 60

AGENTS = [
    ("Scout", "🔭", "Escanea precios y detecta movimientos fuertes"),
    ("News", "📰", "Lee titulares recientes y resume el impacto"),
    ("Sentiment", "🧠", "Mide el sentimiento (bull/bear) del activo"),
    ("Charts", "📈", "Analiza RSI, medias y tendencia"),
    ("Skeptic", "🛡️", "Busca razones para NO operar"),
    ("Chief", "👔", "Decide: LONG / SHORT / NO TRADE"),
]


def t212_creds():
    """Credenciales de Trading 212: solo desde el entorno, nunca se escriben a disco."""
    return os.getenv("T212_API_KEY", ""), os.getenv("T212_API_SECRET", ""), os.getenv("T212_ENV", "demo")
