# onekeyflow/config.py
import os

PANDADOC_API_KEY: str = os.getenv("PANDADOC_API_KEY", "")
DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
DATA_DIR: str = os.getenv("DATA_DIR", ".")
