import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "orders.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row   # rows behave like dicts
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    # Admins / users table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            username  TEXT    UNIQUE NOT NULL,
            password  TEXT    NOT NULL,
            created_at TEXT   DEFAULT (datetime('now'))
        )
    """)

    # Orders queue
    cur.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id           TEXT    PRIMARY KEY,
            customer     TEXT    NOT NULL,
            product      TEXT    NOT NULL,
            qty          INTEGER NOT NULL DEFAULT 1,
            amount       REAL    NOT NULL,
            type         TEXT    NOT NULL,   -- express | standard | economy
            zone         TEXT    NOT NULL,   -- A | B | C
            tier         TEXT    NOT NULL,   -- premium | regular | basic
            age_minutes  REAL    NOT NULL DEFAULT 0,
            priority     REAL    NOT NULL DEFAULT 0,
            status       TEXT    NOT NULL DEFAULT 'queued',
            created_at   TEXT    DEFAULT (datetime('now'))
        )
    """)

    # Delivered log
    cur.execute("""
        CREATE TABLE IF NOT EXISTS delivered_log (
            id           TEXT    PRIMARY KEY,
            customer     TEXT    NOT NULL,
            product      TEXT    NOT NULL,
            qty          INTEGER NOT NULL,
            amount       REAL    NOT NULL,
            type         TEXT    NOT NULL,
            zone         TEXT    NOT NULL,
            tier         TEXT    NOT NULL,
            priority     REAL    NOT NULL,
            delivered_at TEXT    DEFAULT (datetime('now'))
        )
    """)

    conn.commit()
    conn.close()
