import logging
import urllib.request
import re
from decimal import Decimal
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.core import Currency, ExchangeRate, ExchangeRateAuditLog

logger = logging.getLogger(__name__)

def fetch_bcv_rate() -> Decimal:
    """
    Intenta obtener la tasa de cambio oficial del BCV (VES por USD).
    Si falla (offline o error de red), retorna un valor de fallback razonable (ej: 40.0 VES).
    """
    fallback_rate = Decimal("40.000000")
    try:
        # Intenta consultar una API pública de divisas en Venezuela o raspar la web del BCV
        # Usamos urllib para evitar dependencias adicionales no instaladas
        req = urllib.request.Request(
            "https://bcv-api.lhd.ovh/v1/dolar",  # API pública/común o mock para tasas en Venezuela
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            import json
            data = json.loads(response.read().decode())
            rate_val = data.get("rate") or data.get("value") or data.get("dolar")
            if rate_val:
                return Decimal(str(rate_val))
    except Exception as e:
        logger.warning(f"Error consultando API de divisas: {e}. Intentando raspado básico de BCV...")
        try:
            req = urllib.request.Request(
                "http://www.bcv.org.ve/",
                headers={"User-Agent": "Mozilla/5.0"}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                html = response.read().decode('utf-8')
                # Expresión regular para buscar el contenedor de la tasa de USD
                match = re.search(r'id="dolar".*?<strong>\s*([0-9,]+)\s*</strong>', html, re.DOTALL)
                if match:
                    rate_str = match.group(1).replace(",", ".")
                    return Decimal(rate_str)
        except Exception as ex:
            logger.warning(f"Error raspando BCV: {ex}. Usando tasa de fallback: {fallback_rate}")
    
    return fallback_rate

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
        Consulta la tasa oficial y actualiza la divisa VES en la base de datos.
        """
        # Buscar o crear la divisa VES
        ves_currency = db.query(Currency).filter(Currency.code == "VES").first()
        if not ves_currency:
            ves_currency = Currency(
                code="VES",
                name="Bolívar Venezolano",
                symbol="Bs.",
                exchange_rate=Decimal("40.000000"),
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

        new_rate = fetch_bcv_rate()
        old_rate = ves_currency.exchange_rate

        if old_rate != new_rate:
            ves_currency.exchange_rate = new_rate
            db.add(ves_currency)
            
            # Registrar en el historial de tasas
            history = ExchangeRate(currency_id=ves_currency.id, rate=new_rate)
            db.add(history)
            db.commit()
            db.refresh(ves_currency)
            logger.info(f"Tasa de cambio de VES actualizada automáticamente de {old_rate} a {new_rate} por BCV Sync.")
        
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
