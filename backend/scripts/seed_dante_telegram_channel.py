import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.deps import SessionLocal
from app.models.digital_workers import DigitalWorker
from sqlalchemy.orm.attributes import flag_modified
import json

def seed_telegram_channel():
    with SessionLocal() as db:
        dante = db.query(DigitalWorker).filter(DigitalWorker.agent_code == 'DANTE_IT').first()
        if not dante:
            print("Worker DANTE_IT not found.")
            return

        conf = dict(dante.channel_config or {})
        conf['telegram'] = {
            'enabled': True,
            'token': '8940269345:AAHbK_NoIFfvzpKBIom0EAdD0TbX3vsMF_8',
            'bot_id': 8940269345,
            'bot_username': 'neo_dante_it_bot',
            'bot_first_name': 'Dante TI - Neo Soft',
            'webhook_url': 'https://api.qa.morpheussoft.net/api/v1/telegram/dante_it/webhook',
            'webhook_registered': True,
            'updated_at': '2026-09-16T15:45:00'
        }
        dante.channel_config = conf
        flag_modified(dante, 'channel_config')
        db.commit()
        db.refresh(dante)
        print("Dante TI channel_config updated in database:")
        print(json.dumps(dante.channel_config, indent=2))

if __name__ == "__main__":
    seed_telegram_channel()
