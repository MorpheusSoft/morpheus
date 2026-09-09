import logging
import urllib.request
import ssl
import json
import re
from decimal import Decimal
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo
    CARACAS_TZ = ZoneInfo("America/Caracas")
except Exception:
    CARACAS_TZ = timezone(timedelta(hours=-4))
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.core import Currency, ExchangeRate, ExchangeRateAuditLog

logger = logging.getLogger(__name__)

def fetch_bcv_rate_details() -> dict:
    """
    Obtiene los detalles de la tasa de cambio oficial del BCV (VES por USD)
    y la Fecha Valor oficial publicada en el portal.
    Retorna un diccionario con 'rate' (Decimal) y 'effective_date' (datetime).
    """
    now = datetime.now(CARACAS_TZ)
    fallback_rate = Decimal("820.101800")
    rate = None
    effective_date = now

    # 1. Intento primario: Web oficial del BCV con SSL permisivo y headers de navegador
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        }
        req = urllib.request.Request("https://www.bcv.org.ve/", headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=12) as response:
            html = response.read().decode("utf-8", errors="ignore")

            # Extracción de la tasa USD: id="dolar" ... <strong class="...">820,10180000</strong>
            dolar_match = re.search(r'id=["\']dolar["\'].*?<strong[^>]*>\s*([0-9\.,]+)\s*</strong>', html, re.DOTALL)
            if dolar_match:
                raw_str = dolar_match.group(1).strip()
                if "." in raw_str and "," in raw_str:
                    raw_str = raw_str.replace(".", "").replace(",", ".")
                elif "," in raw_str:
                    raw_str = raw_str.replace(",", ".")
                rate = Decimal(raw_str)

            # Extracción de Fecha Valor: property="dc:date" content="2026-09-09T00:00:00-04:00"
            date_match = re.search(r'property=["\']dc:date["\'][^>]*content=["\']([^"\']+)["\']', html)
            if not date_match:
                date_match = re.search(r'content=["\']([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[^"\']*)["\']', html)
            
            if date_match:
                try:
                    effective_date = datetime.fromisoformat(date_match.group(1).strip())
                except Exception as ex:
                    logger.warning(f"[BCV SCRAPER] Error parseando Fecha Valor '{date_match.group(1)}': {ex}")

            if rate:
                logger.info(f"[BCV SCRAPER] Tasa obtenida de bcv.org.ve: {rate} USD/VES, Fecha Valor: {effective_date}")
                return {"rate": rate, "effective_date": effective_date, "source": "bcv.org.ve"}
    except Exception as e:
        logger.warning(f"[BCV SCRAPER] Error conectando a portal web BCV: {e}. Intentando API espejo de contingencia...")

    # 2. Intento secundario (Fallback oficial espejo)
    fallback_urls = [
        "https://ve.dolarapi.com/v1/dolares/oficial",
        "https://bcv-api.lhd.ovh/v1/dolar"
    ]
    for url in fallback_urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as response:
                data = json.loads(response.read().decode())
                rate_val = data.get("promedio") or data.get("rate") or data.get("value") or data.get("dolar")
                if rate_val:
                    rate = Decimal(str(rate_val))
                    raw_date = data.get("fechaActualizacion") or data.get("date")
                    if raw_date:
                        try:
                            effective_date = datetime.fromisoformat(str(raw_date).strip())
                        except Exception:
                            effective_date = now
                    logger.info(f"[BCV SCRAPER] Tasa obtenida de API espejo {url}: {rate}, Fecha: {effective_date}")
                    return {"rate": rate, "effective_date": effective_date, "source": url}
        except Exception as ex:
            logger.warning(f"[BCV SCRAPER] Falló API espejo {url}: {ex}")

    # 3. Fallback final de seguridad si no hay conectividad
    logger.error(f"[BCV SCRAPER] No fue posible obtener tasa BCV en vivo. Usando tasa de fallback {fallback_rate}.")
    return {"rate": fallback_rate, "effective_date": now, "source": "fallback"}

def fetch_bcv_rate() -> Decimal:
    """
    Retorna únicamente el valor numérico (Decimal) de la tasa de cambio del BCV.
    """
    details = fetch_bcv_rate_details()
    return details["rate"]

class CurrencyService:
    @staticmethod
    def get_converted_amount(amount: Decimal, from_currency_code: str, to_currency_code: str, rate: Decimal) -> Decimal:
        """
        Realiza la conversión bimonetaria entre USD y VES usando la tasa dada.
        Si la tasa es 0 o None, retorna 0.
        """
        if not amount:
            return Decimal("0.0")
        if from_currency_code == to_currency_code:
            return amount
            
        if from_currency_code == "USD" and to_currency_code == "VES":
            return amount * rate
        elif from_currency_code == "VES" and to_currency_code == "USD":
            if rate == 0:
                return Decimal("0.0")
            return amount / rate
        return amount

    @staticmethod
    def sync_daily_bcv_rate(db: Session) -> Currency:
        """
        Consulta la tasa oficial del BCV y actualiza la divisa VES tanto en la tabla activa
        (core.currencies) como en el histórico oficial (core.exchange_rates).
        """
        # Buscar o crear la divisa VES
        ves_currency = db.query(Currency).filter(Currency.code == "VES").first()
        if not ves_currency:
            ves_currency = Currency(
                code="VES",
                name="Bolívar Venezolano",
                symbol="Bs.",
                exchange_rate=Decimal("820.101800"),
                decimal_places=2,
                is_active=True
            )
            db.add(ves_currency)
            db.commit()
            db.refresh(ves_currency)

        # Buscar o crear la divisa USD si no existe
        usd_currency = db.query(Currency).filter(Currency.code == "USD").first()
        if not usd_currency:
            usd_currency = Currency(
                code="USD",
                name="Dólar Estadounidense",
                symbol="$",
                exchange_rate=Decimal("1.000000"),
                decimal_places=2,
                is_active=True
            )
            db.add(usd_currency)
            db.commit()

        # Obtener tasa y fecha valor del BCV
        bcv_details = fetch_bcv_rate_details()
        new_rate = bcv_details["rate"]
        effective_date = bcv_details["effective_date"]
        old_rate = ves_currency.exchange_rate

        # 1. Actualizar tasa en la tabla activa (core.currencies)
        ves_currency.exchange_rate = new_rate
        db.add(ves_currency)

        # 2. Registrar en la tabla histórica (core.exchange_rates)
        eff_date_only = effective_date.date() if hasattr(effective_date, "date") else effective_date
        existing_history = db.query(ExchangeRate).filter(
            ExchangeRate.currency_id == ves_currency.id,
            func.date(ExchangeRate.effective_date) == eff_date_only
        ).first()

        if existing_history:
            existing_history.rate = new_rate
            existing_history.effective_date = effective_date
            existing_history.created_at = datetime.now(CARACAS_TZ)
            db.add(existing_history)
        else:
            history = ExchangeRate(
                currency_id=ves_currency.id,
                rate=new_rate,
                effective_date=effective_date
            )
            db.add(history)

        # 3. Registrar auditoría si hubo variación de tasa
        if old_rate != new_rate:
            audit = ExchangeRateAuditLog(
                user_id=None,
                old_rate=old_rate,
                new_rate=new_rate,
                reason=f"Automático: Sincronización oficial BCV (Fecha Valor: {effective_date.strftime('%Y-%m-%d')})"
            )
            db.add(audit)

        db.commit()
        db.refresh(ves_currency)
        logger.info(
            f"[BCV SYNC] Tasa VES sincronizada exitosamente: {new_rate} (anterior: {old_rate}). "
            f"Fecha Valor: {effective_date}"
        )
        return ves_currency

    @staticmethod
    def update_rate_manual(db: Session, currency_id: int, new_rate: Decimal, reason: str, user_id: int) -> Currency:
        """
        Actualiza de forma manual la tasa de cambio de una divisa, registrando auditoría
        y enviando alerta al Supervisor o Gerente de Área.
        """
        currency = db.query(Currency).filter(Currency.id == currency_id).first()
        if not currency:
            raise ValueError("Divisa no encontrada")

        old_rate = currency.exchange_rate
        if old_rate == new_rate:
            return currency

        # Actualizar tasa de la divisa
        currency.exchange_rate = new_rate
        db.add(currency)

        # Histórico de tasas
        history = ExchangeRate(currency_id=currency.id, rate=new_rate)
        db.add(history)

        # Auditoría de sobrescritura
        audit = ExchangeRateAuditLog(
            user_id=user_id,
            old_rate=old_rate,
            new_rate=new_rate,
            reason=reason
        )
        db.add(audit)
        db.commit()
        db.refresh(currency)

        # Generar Alerta/Notificación al supervisor
        alert_msg = (
            f"ALERTA CAMBIO DE TASA MANUAL: El usuario ID {user_id} ha modificado la tasa de {currency.code} "
            f"de {old_rate} a {new_rate}. Motivo: '{reason}'"
        )
        logger.warning(alert_msg)
        print(f"\033[93m[ALERTA DE AUDITORÍA]\033[0m {alert_msg}")

        return currency
