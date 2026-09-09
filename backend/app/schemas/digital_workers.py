from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class DigitalSkillBase(BaseModel):
    skill_code: str
    operational_module: str
    name: str
    description: str
    execution_type: Optional[str] = "NATIVE_CODE"
    handler_function: Optional[str] = None
    declarative_prompt: Optional[str] = None

class DigitalSkillCreate(DigitalSkillBase):
    pass

class DigitalSkill(DigitalSkillBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class DigitalWorkerSkillResponse(BaseModel):
    id: int
    worker_id: int
    skill_id: int
    is_enabled: bool
    parameters: Optional[Dict[str, Any]] = {}
    created_at: Optional[datetime] = None
    skill: Optional[DigitalSkill] = None

    class Config:
        from_attributes = True

class DigitalWorkerActionLogResponse(BaseModel):
    id: int
    worker_id: int
    facility_id: Optional[int] = None
    action_type: str
    target_entity_type: Optional[str] = None
    target_entity_id: Optional[str] = None
    severity: str
    summary: str
    details: Optional[Dict[str, Any]] = None
    recipient_target: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class DigitalWorkerBase(BaseModel):
    agent_code: str
    display_title: str
    operational_module: str
    system_prompt: str
    model_name: Optional[str] = "gemini-2.5-flash"
    is_autonomous_active: Optional[bool] = True
    scan_interval_minutes: Optional[int] = 60
    channel_config: Optional[Dict[str, Any]] = {}
    guardrails_config: Optional[Dict[str, Any]] = {}

class DigitalWorkerCreate(DigitalWorkerBase):
    user_id: int
    skill_ids: Optional[List[int]] = []

class DigitalWorkerUpdate(BaseModel):
    display_title: Optional[str] = None
    system_prompt: Optional[str] = None
    model_name: Optional[str] = None
    is_autonomous_active: Optional[bool] = None
    scan_interval_minutes: Optional[int] = None
    channel_config: Optional[Dict[str, Any]] = None
    guardrails_config: Optional[Dict[str, Any]] = None

class DigitalWorkerUserSummary(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    user_type: Optional[str] = "DIGITAL_WORKER"
    phone_number: Optional[str] = None
    is_phone_verified: Optional[bool] = False
    pairing_pin: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True

class DigitalWorkerResponse(DigitalWorkerBase):
    id: int
    user_id: int
    last_scan_at: Optional[datetime] = None
    created_at: datetime
    user: Optional[DigitalWorkerUserSummary] = None
    worker_skills: List[DigitalWorkerSkillResponse] = []

    class Config:
        from_attributes = True

class SkillToggleRequest(BaseModel):
    is_enabled: bool
    parameters: Optional[Dict[str, Any]] = None

class WorkerRunResponse(BaseModel):
    status: str
    agent_code: str
    summary: Dict[str, Any]
