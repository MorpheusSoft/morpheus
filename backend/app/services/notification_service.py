import logging
from abc import ABC, abstractmethod
from typing import Any
from app.models.purchasing import PurchaseOrder

logger = logging.getLogger(__name__)

class NotificationProvider(ABC):
    @abstractmethod
    def send_order_link(self, order: PurchaseOrder, delivery_target: str) -> bool:
        pass

class ConsoleEmailNotifier(NotificationProvider):
    def send_order_link(self, order: PurchaseOrder, delivery_target: str) -> bool:
        """
        [SIMULADOR SMTP]
        En el futuro este módulo inyectará las credenciales reales de SMTP (AWS SES, SendGrid, etc).
        """
        link = f"http://localhost:8000/api/v1/purchase-orders/portal/{order.secure_token}/download"
        
        email_body = f"""
        \033[94m
        ====================================================
        [MOCK SMTP] NUEVA ORDEN DE COMPRA DE NEO ERP 🏢
        ====================================================
        ✉️ PARA: {delivery_target}
        📌 ASUNTO: Orden de Compra {order.reference}
        
        Estimado Proveedor,
        
        Neo ERP ha generado una nueva Orden de Compra para usted.
        Para descargar el documento PDF y acusar recibo formal,
        haga clic en su enlace de telemetría seguro:
        
        🔗 ENLACE OFICIAL: {link}
        
        Por favor no responda a este correo de simulación.
        ====================================================
        \033[0m
        """
        print(email_body)
        logger.info(f"Mock Email sent to {delivery_target} for order {order.reference}")
        return True

class ConsoleWhatsAppNotifier(NotificationProvider):
    def send_order_link(self, order: PurchaseOrder, delivery_target: str) -> bool:
        """
        [SIMULADOR WHATSAPP]
        Preparado para la API de Meta / Twilio.
        """
        link = f"http://localhost:8000/api/v1/purchase-orders/portal/{order.secure_token}/download"
        
        wa_message = f"""
        \033[92m
        📱 [MOCK WHATSAPP] ENVIANDO A: {delivery_target}
        💬 MENSAJE:
        ¡Hola! NEO ERP te ha enviado la Orden de Compra *{order.reference}*.
        Descarga tu PDF aquí: {link}
        \033[0m
        """
        print(wa_message)
        logger.info(f"Mock WhatsApp sent to {delivery_target} for order {order.reference}")
        return True

class NotificationFactory:
    @staticmethod
    def get_provider(method: str = "email") -> NotificationProvider:
        if method == "whatsapp":
            return ConsoleWhatsAppNotifier()
        return ConsoleEmailNotifier()

def dispatch_purchase_order(order: PurchaseOrder, method: str = "email", target: str = "") -> bool:
    provider = NotificationFactory.get_provider(method)
    return provider.send_order_link(order, target)
