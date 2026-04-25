from fastapi import APIRouter, Depends
from app.api import deps
from app.api.v1.endpoints import login, products, catalog, stock, inventory, reports, utils, customers, inventory_bulk, orders, inventory_session, suppliers, buyers, mrp, purchase_orders, currencies, wms, jobs, dashboard, facilities, pricing_sessions, companies, roles, users

api_router = APIRouter()
api_router.include_router(login.router, tags=["login"])

# Protected routes
secure_dependencies = [Depends(deps.get_current_active_user)]

api_router.include_router(products.router, prefix="/products", tags=["products"], dependencies=secure_dependencies)
api_router.include_router(catalog.router, tags=["catalog"], dependencies=secure_dependencies)
api_router.include_router(stock.router, prefix="/stock", tags=["stock"], dependencies=secure_dependencies)
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"], dependencies=secure_dependencies)
api_router.include_router(inventory_session.router, prefix="/inventory-session", tags=["inventory session"], dependencies=secure_dependencies)
api_router.include_router(reports.router, prefix="/reports", tags=["reports"], dependencies=secure_dependencies)
api_router.include_router(utils.router, prefix="/utils", tags=["utils"], dependencies=secure_dependencies)
api_router.include_router(customers.router, prefix="/customers", tags=["customers"], dependencies=secure_dependencies)
api_router.include_router(inventory_bulk.router, prefix="/inventory-bulk", tags=["inventory bulk"], dependencies=secure_dependencies)
api_router.include_router(orders.router, prefix="/orders", tags=["orders"], dependencies=secure_dependencies)
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["suppliers"], dependencies=secure_dependencies)
api_router.include_router(buyers.router, prefix="/buyers", tags=["buyers"], dependencies=secure_dependencies)
api_router.include_router(mrp.router, prefix="/mrp", tags=["mrp"], dependencies=secure_dependencies)
api_router.include_router(purchase_orders.router, prefix="/purchase-orders", tags=["purchase-orders"], dependencies=secure_dependencies)
api_router.include_router(currencies.router, prefix="/currencies", tags=["currencies"], dependencies=secure_dependencies)
api_router.include_router(wms.router, prefix="/wms", tags=["wms"], dependencies=secure_dependencies)
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"], dependencies=secure_dependencies)
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"], dependencies=secure_dependencies)
api_router.include_router(facilities.router, prefix="/facilities", tags=["facilities"], dependencies=secure_dependencies)
api_router.include_router(pricing_sessions.router, prefix="/pricing-sessions", tags=["pricing sessions"], dependencies=secure_dependencies)
api_router.include_router(companies.router, prefix="/companies", tags=["companies"], dependencies=secure_dependencies)
api_router.include_router(roles.router, prefix="/roles", tags=["roles"], dependencies=secure_dependencies)
api_router.include_router(users.router, prefix="/users", tags=["users"], dependencies=secure_dependencies)

