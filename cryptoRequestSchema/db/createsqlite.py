import sqlite3 as sql
import os

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(DB_DIR, "users.db"))

class dbConnection:
    def __init__(self, dbname=DB_PATH):
        self.conn = sql.connect(dbname)
        self.cursor = self.conn.cursor()
    
    def execute_query(self, query, params=()):
        self.cursor.execute(query, params)
        self.conn.commit()
        return self.cursor.fetchall()
    
    def close(self):
        self.conn.close()

def init_db(dbname=DB_PATH):
    conn = sql.connect(dbname)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        two_factor_secret TEXT NOT NULL,
        two_factor_enabled INTEGER DEFAULT 1,
        two_factor_backup_code TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Migrações caso colunas não existam em banco pré-existente
    cursor.execute("PRAGMA table_info(users);")
    columns = [col[1] for col in cursor.fetchall()]

    if "two_factor_secret" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN two_factor_secret TEXT;")
    if "two_factor_enabled" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 1;")
    if "two_factor_backup_code" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN two_factor_backup_code TEXT;")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print(f"Banco de dados SQLite inicializado com suporte a 2FA em: {DB_PATH}")
