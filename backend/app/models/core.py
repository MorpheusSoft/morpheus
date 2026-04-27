from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Text, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class Currency(Base):
    __tablename__ = "currencies"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    symbol = Column(String)
    exchange_rate = Column(Numeric(12, 6), default=1)
    decimal_places = Column(Integer, default=2)
    is_active = Column(Boolean, default=True)

class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    currency_id = Column(Integer, ForeignKey("core.currencies.id"), nullable=False)
    rate = Column(Numeric(18, 6), nullable=False)
    effective_date = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, index=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    roles = relationship("Role", secondary="core.user_roles", backref="users")
    facilities = relationship("Facility", secondary="core.user_facilities", backref="users")

class Role(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "core"}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String)
    can_use_oracle = Column(Boolean, default=False)
    permissions = Column(JSONB, server_default='{}')
    is_active = Column(Boolean, default=True)

class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = {"schema": "core"}

    user_id = Column(Integer, ForeignKey("core.users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(Integer, ForeignKey("core.roles.id", ondelete="CASCADE"), primary_key=True)

class UserFacility(Base):
    __tablename__ = "user_facilities"
    __table_args__ = {"schema": "core"}

    user_id = Column(Integer, ForeignKey("core.users.id", ondelete="CASCADE"), primary_key=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id", ondelete="CASCADE"), primary_key=True)

class Company(Base):
    __tablename__ = "companies"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    tax_id = Column(String)
    currency_code = Column(String, default="USD")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Facility(Base):
    __tablename__ = "facilities"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("core.companies.id"))
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    address = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SystemSettings(Base):
    __tablename__ = "system_settings"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    system_currency_id = Column(Integer, ForeignKey("core.currencies.id"))
    country_currency_id = Column(Integer, ForeignKey("core.currencies.id"))
    default_valuation_method = Column(String, nullable=False, default='AVERAGE')
    utility_calc_method = Column(String, nullable=False, default='MARGIN_ON_SALES')

from sqlalchemy.dialects.postgresql import JSONB

class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("core.companies.id"))
    
    # 1. Información General y Legal
    tax_id = Column(String, unique=True, nullable=False) # RIF
    international_tax_id = Column(String) # RUC / NIT
    name = Column(String, nullable=False) # Razón Social
    commercial_name = Column(String) # Nombre Comercial
    fiscal_address = Column(Text)
    is_active = Column(Boolean, default=True)
    
    # 2. Reglas Comerciales y Logísticas
    currency_id = Column(Integer, ForeignKey("core.currencies.id"))
    default_facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=True) # Opcional: Si existe, despacho CENDI.
    credit_days = Column(Integer, default=0)
    credit_limit = Column(Numeric(19, 4), default=0)
    early_payment_days = Column(Integer, default=0)
    early_payment_discount_pct = Column(Numeric(5, 2), default=0)
    lead_time_days = Column(Integer, default=0) # Días de Despacho
    restock_coverage_days = Column(Integer, default=0) # Días para Reposición
    sales_analysis_days = Column(Integer, default=0) # Días de Análisis
    minimum_order_qty = Column(Numeric(19, 4), default=0) # MOQ
    
    # 3. Contactos Segmentados
    commercial_contact_name = Column(String)
    commercial_contact_phone = Column(String)
    commercial_email = Column(String)
    financial_contact_name = Column(String)
    financial_contact_phone = Column(String)
    financial_email = Column(String)

    banks = relationship("SupplierBank", backref="supplier", cascade="all, delete-orphan")

class SupplierBank(Base):
    __tablename__ = "supplier_banks"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("core.suppliers.id"))
    bank_name = Column(String, nullable=False)
    account_number = Column(String, nullable=False)
    swift_code = Column(String)
    aba_code = Column(String)
    currency_id = Column(Integer, ForeignKey("core.currencies.id"))

class Buyer(Base):
    __tablename__ = "buyers"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("core.users.id"))
    assigned_categories = Column(JSONB)
    assigned_facilities = Column(JSONB)
    assigned_suppliers = Column(JSONB)
    approval_limit = Column(Numeric(19, 4), default=0)

class Tribute(Base):
    __tablename__ = "tributes"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    rate = Column(Numeric(5, 2), nullable=False)
    is_active = Column(Boolean, default=True)

from sqlalchemy import Time

class SystemJob(Base):
    __tablename__ = "system_jobs"
    __table_args__ = {"schema": "core"}
    
    id = Column(Integer, primary_key=True, index=True)
    job_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    is_enabled = Column(Boolean, default=True)
    execution_time = Column(Time, nullable=False)
    last_executed_at = Column(DateTime(timezone=True))

