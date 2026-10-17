"""
API Routers for TEEVRA Backend.
Exposes endpoints for managers, breakdowns, guardians, safety signals, and supervisors.
"""

from app.routers.breakdown_router import router as breakdown_router
from app.routers.guardian_router import router as guardian_router
from app.routers.manager_router import router as manager_router
from app.routers.safety_signals_router import router as safety_signals_router
from app.routers.supervisor_router import router as supervisor_router

__all__ = [
    "breakdown_router",
    "guardian_router",
    "manager_router",
    "safety_signals_router",
    "supervisor_router",
]
