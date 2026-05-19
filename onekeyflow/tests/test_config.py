# onekeyflow/tests/test_config.py
import importlib


def test_defaults(monkeypatch):
    monkeypatch.delenv("PANDADOC_API_KEY", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.delenv("DATA_DIR", raising=False)
    import config
    importlib.reload(config)
    assert config.PANDADOC_API_KEY == ""
    assert config.REDIS_URL == "redis://localhost:6379/0"
    assert config.DATA_DIR == "."


def test_reads_env_vars(monkeypatch):
    monkeypatch.setenv("PANDADOC_API_KEY", "testkey")
    monkeypatch.setenv("REDIS_URL", "redis://custom:6379/1")
    import config
    importlib.reload(config)
    assert config.PANDADOC_API_KEY == "testkey"
    assert config.REDIS_URL == "redis://custom:6379/1"
