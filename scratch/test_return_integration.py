import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from app.database import async_session_factory
from app.services.analytics_service import get_credit_debit_report, get_outlet_earnings_report
from app.models.customer_return import CustomerReturn
from sqlalchemy import select

async def main():
    async with async_session_factory() as db:
        # 1. Check CustomerReturn columns in model query
        stmt = select(CustomerReturn).limit(1)
        res = await db.execute(stmt)
        row = res.scalar_one_or_none()
        print("[OK] CustomerReturn queried successfully, row:", row)

        # 2. Get an outlet ID if any
        from app.models.outlet import Outlet
        outlet_stmt = select(Outlet.id).limit(1)
        outlet_res = await db.execute(outlet_stmt)
        outlet_id = outlet_res.scalar_one_or_none()
        
        if outlet_id:
            now = datetime.now(timezone.utc)
            from_dt = now - timedelta(days=30)
            to_dt = now + timedelta(days=1)
            
            # 3. Test get_credit_debit_report
            report = await get_credit_debit_report(db, outlet_id, from_dt, to_dt)
            print("[OK] get_credit_debit_report executed successfully:")
            print("     Summary:", report.get("summary"))
            print("     Customers count:", len(report.get("customers", [])))
            print("     Transactions count:", len(report.get("transactions", [])))
            
            # 4. Test get_outlet_earnings_report
            earnings = await get_outlet_earnings_report(db, outlet_id, from_dt, to_dt)
            print("[OK] get_outlet_earnings_report executed successfully:")
            dump = earnings.model_dump()
            print("     Earnings keys:", list(dump.keys()))
            print("     Net Drawer Cash:", dump.get("net_drawer_cash"))
            print("     Customer credit/debit breakdown:", {k: v for k, v in dump.items() if "credit" in k or "debit" in k or "return" in k})
        else:
            print("No outlet found to test reports.")

if __name__ == "__main__":
    asyncio.run(main())
