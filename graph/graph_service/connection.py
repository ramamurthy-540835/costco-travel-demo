import os

import psycopg


def get_connection():
    conn = psycopg.connect(
        host=os.environ.get("PG_HOST", "localhost"),
        port=os.environ.get("PG_PORT", "5434"),
        dbname=os.environ.get("PG_DATABASE", "rental"),
        user=os.environ.get("PG_USER", "postgres"),
        password=os.environ.get("PG_PASSWORD", "localdev"),
        autocommit=True,
    )
    with conn.cursor() as cur:
        cur.execute("LOAD 'age';")
        cur.execute('SET search_path = ag_catalog, "$user", public;')
    return conn
