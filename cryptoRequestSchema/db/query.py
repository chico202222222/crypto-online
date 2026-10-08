import sqlite3
import os
import hashlib
import secrets
import time
import base64
import struct

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(DB_DIR, "users.db"))

def hash_password(password: str) -> str:
    """Gera um hash PBKDF2-HMAC-SHA256 com salt aleatório seguro de 16 bytes."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000)
    return f"{salt}:{key.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verifica senha com comparação em tempo constante contra timing attacks."""
    if not stored_hash or ":" not in stored_hash:
        return False
    salt, key_hex = stored_hash.split(":", 1)
    new_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000)
    return secrets.compare_digest(new_key.hex(), key_hex)

def is_allowed_user(email: str) -> bool:
    """Verifica se o usuário pertence à lista restrita de autorizados."""
    allowed_env = os.environ.get("ALLOWED_USERS", "")
    allowed_list = [u.strip().lower() for u in allowed_env.split(",") if u.strip()]
    return email.strip().lower() in allowed_list

def generate_totp_code(secret_b32: str, for_time: int = None) -> str:
    """Gera código TOTP de 6 dígitos padrão RFC 6238."""
    if for_time is None:
        for_time = int(time.time())
    time_counter = for_time // 30
    key = base64.b32decode(secret_b32, casefold=True)
    msg = struct.pack(">Q", time_counter)
    import hmac
    hmac_hash = hmac.new(key, msg, hashlib.sha1).digest()
    offset = hmac_hash[-1] & 0x0F
    truncated_hash = struct.unpack(">I", hmac_hash[offset:offset+4])[0] & 0x7FFFFFFF
    code = truncated_hash % 1000000
    return f"{code:06d}"

def verify_totp(code: str, secret_b32: str) -> bool:
    """Valida o código 2FA de 6 dígitos com segredo próprio do usuário."""
    if not code or not code.strip().isdigit() or len(code.strip()) != 6 or not secret_b32:
        return False
    cleaned_code = code.strip()

    # Janela TOTP atual, anterior e posterior (tolerância de ±30s)
    current_time = int(time.time())
    for t in (current_time - 30, current_time, current_time + 30):
        try:
            expected = generate_totp_code(secret_b32, t)
            if secrets.compare_digest(cleaned_code, expected):
                return True
        except Exception:
            pass

    return False

class Initializer:
    def __init__(self, dbpath=DB_PATH):
        self.dbpath = dbpath
        self.conn = sqlite3.connect(self.dbpath)
        self.cursor = self.conn.cursor()
        self._ensure_table()

    def _ensure_table(self):
        self.cursor.execute("""
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
        # Migrações caso colunas não existam
        self.cursor.execute("PRAGMA table_info(users);")
        columns = [col[1] for col in self.cursor.fetchall()]
        if "two_factor_secret" not in columns:
            self.cursor.execute("ALTER TABLE users ADD COLUMN two_factor_secret TEXT;")
        if "two_factor_enabled" not in columns:
            self.cursor.execute("ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 1;")
        if "two_factor_backup_code" not in columns:
            self.cursor.execute("ALTER TABLE users ADD COLUMN two_factor_backup_code TEXT;")
        self.conn.commit()

    def register(self, email: str, password: str, two_factor_secret: str, role: str = "user"):
        """Registra usuário somente se estiver na lista de usuários autorizados com senha criptografada (hashed)."""
        normalized_email = email.strip().lower()

        if not is_allowed_user(normalized_email):
            raise PermissionError(f"Usuário '{normalized_email}' não está autorizado na plataforma.")
        if not two_factor_secret:
            raise ValueError("Segredo TOTP individual obrigatório.")

        hashed = hash_password(password)
        query = """
        INSERT INTO users (email, password, role, two_factor_secret, two_factor_enabled, two_factor_backup_code)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(email) DO UPDATE SET
            password=excluded.password,
            role=excluded.role,
            two_factor_secret=excluded.two_factor_secret,
            two_factor_backup_code=excluded.two_factor_backup_code;
        """
        self.execute_query(query, (normalized_email, hashed, role, two_factor_secret, None))
        return True

    def verify_user(self, email: str, password: str) -> bool:
        """Verifica se o e-mail e a senha conferem com o hash no banco."""
        normalized_email = email.strip().lower()
        if not is_allowed_user(normalized_email):
            return False

        rows = self.execute_query("SELECT password FROM users WHERE email = ? LIMIT 1;", (normalized_email,))
        if not rows:
            return False
        stored_hash = rows[0][0]
        return verify_password(password, stored_hash)

    def verify_user_2fa(self, email: str, code: str) -> bool:
        """Verifica se o código 2FA é válido para o usuário."""
        normalized_email = email.strip().lower()
        rows = self.execute_query("SELECT two_factor_secret, two_factor_backup_code, two_factor_enabled FROM users WHERE email = ? LIMIT 1;", (normalized_email,))
        if not rows:
            return False
        secret, _, enabled = rows[0]
        if not enabled or not secret:
            return False
        return verify_totp(code, secret)

    def execute_query(self, query: str, params=()):
        if params is None:
            params = ()
        self.cursor.execute(query, params)
        self.conn.commit()
        return self.cursor.fetchall()

    def close(self):
        self.conn.close()

if __name__ == "__main__":
    db = Initializer()
    print(f"Inicializando banco de dados em: {DB_PATH}")
    db.close()
