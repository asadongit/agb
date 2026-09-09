"""
SQLAlchemy async engine, session factory, and declarative Base.
"""

from __future__ import annotations
from collections.abc import AsyncGenerator
from datetime import datetime

from sqlalchemy import MetaData, func, event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import get_settings

settings = get_settings()

# Naming convention for constraints — keeps Alembic autogenerate predictable
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=convention)

from urllib.parse import urlparse, parse_qs, urlunparse, urlencode

def get_db_connection_args(raw_url: str, is_debug: bool = False) -> tuple[str, dict]:
    """
    Parses the database URL and generates connection arguments.
    Handles SQLite, Postgres, and various SSL requirements cleanly.
    """
    db_url = raw_url
    
    # Normalize URL scheme
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine_kwargs: dict = {"echo": is_debug}
    
    if db_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
        return db_url, engine_kwargs
        
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

    # Parse and strip libpq sslmode query parameters which crash asyncpg's parser
    parsed = urlparse(db_url)
    qs = parse_qs(parsed.query)
    sslmode = qs.pop("sslmode", [None])[0]
    
    new_query = urlencode(qs, doseq=True)
    db_url = urlunparse(parsed._replace(query=new_query))

    if sslmode == "disable":
        pass  # Local Postgres / No SSL
    elif sslmode in ["verify-ca", "verify-full"]:
        # Strict SSL: verifies CA and hostname
        import ssl as _ssl
        _pg_ssl_ctx = _ssl.create_default_context()
        engine_kwargs["connect_args"] = {"ssl": _pg_ssl_ctx}
    elif sslmode == "require":
        # Standard 'require': encrypts but does not strictly verify CA/hostname (ideal for RDS)
        import ssl as _ssl
        _pg_ssl_ctx = _ssl.create_default_context()
        _pg_ssl_ctx.check_hostname = False
        _pg_ssl_ctx.verify_mode = _ssl.CERT_NONE
        engine_kwargs["connect_args"] = {"ssl": _pg_ssl_ctx}
    else:
        # Default behavior (if no sslmode is specified): let asyncpg/sqlalchemy handle it natively.
        # Forcing SSL here breaks connections to self-hosted DBs that don't support it.
        pass
        
    return db_url, engine_kwargs

parsed_url, engine_opts = get_db_connection_args(settings.DATABASE_URL, settings.DEBUG)

engine = create_async_engine(
    parsed_url,
    **engine_opts,
)

from app.core.datetime_utils import strip_tz

@event.listens_for(engine.sync_engine, "before_cursor_execute", retval=True)
def _sanitize_params_for_asyncpg(conn, cursor, statement, parameters, context, executemany):
    """
    Intercept query parameters before cursor execution and convert any
    timezone-aware datetime to naive UTC.
    
    This provides an engine-level safeguard protecting against asyncpg DataError
    'can't subtract offset-naive and offset-aware datetimes' whenever a client
    or ORM sends an offset-aware datetime into a TIMESTAMP WITHOUT TIME ZONE column.
    """
    if parameters is not None:
        if isinstance(parameters, tuple):
            parameters = tuple(strip_tz(x) for x in parameters)
        elif isinstance(parameters, list):
            if executemany:
                parameters = [
                    tuple(strip_tz(x) for x in row) if isinstance(row, tuple)
                    else [strip_tz(x) for x in row] if isinstance(row, list)
                    else {k: strip_tz(v) for k, v in row.items()} if isinstance(row, dict)
                    else strip_tz(row)
                    for row in parameters
                ]
            else:
                parameters = [strip_tz(x) for x in parameters]
        elif isinstance(parameters, dict):
            parameters = {k: strip_tz(v) for k, v in parameters.items()}
    return statement, parameters

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all models."""

    metadata = metadata


class TimestampMixin:
    """Adds created_at and updated_at columns with server defaults."""

    created_at: Mapped[datetime] = mapped_column(
        default=None,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=None,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a DB session and closes it after."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


get_db = get_async_session
